export default{
  async fetch(request,env){
    const url=new URL(request.url);
    const path=url.pathname;

    // CORS
    if(request.method==="OPTIONS"){
      return new Response(null,{headers:corsHeaders()});
    }

    try{
      // GET /api/reports - list active reports
      if(path==="/api/reports"&&request.method==="GET"){
        return listReports(env);
      }

      // POST /api/report - create report
      if(path==="/api/report"&&request.method==="POST"){
        return createReport(request,env);
      }

      // DELETE /api/report/:id - delete report
      const delMatch=path.match(/^\/api\/report\/([^/]+)$/);
      if(delMatch&&request.method==="DELETE"){
        return deleteReport(delMatch[1],request,env);
      }

      // POST /api/report/:id/flag - flag report
      const flagMatch=path.match(/^\/api\/report\/([^/]+)\/flag$/);
      if(flagMatch&&request.method==="POST"){
        return flagReport(flagMatch[1],env);
      }

      return new Response("Not found",{status:404,headers:corsHeaders()});
    }catch(e){
      return new Response(JSON.stringify({error:e.message}),{status:500,headers:{...corsHeaders(),"Content-Type":"application/json"}});
    }
  }
};

function corsHeaders(){
  return{
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type"
  };
}

/* ── Schema (run once) ── */
async function ensureSchema(env){
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS reports(
      id TEXT PRIMARY KEY,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      severity INTEGER NOT NULL DEFAULT 3,
      note TEXT DEFAULT '',
      photo_url TEXT,
      photo_path TEXT,
      created TEXT NOT NULL,
      expires TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      flags INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS tokens(
      report_id TEXT NOT NULL,
      token TEXT NOT NULL,
      PRIMARY KEY(report_id,token)
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_reports_coords ON reports(lat,lng)
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created)
  `).run();
}

/* ── Helpers ── */
function generateId(){
  return crypto.randomUUID().replace(/-/g,"").slice(0,16);
}

function generateToken(){
  const buf=new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf,b=>b.toString(16).padStart(2,"0")).join("");
}

function hashIp(ip,salt){
  // Simple salted hash for rate limiting (not cryptographic, but sufficient)
  let h=0;
  const str=salt+ip;
  for(let i=0;i<str.length;i++){
    h=((h<<5)-h)+str.charCodeAt(i);
    h|=0;
  }
  return"h_"+(h>>>0).toString(36);
}

function getClientIp(request){
  return request.headers.get("CF-Connecting-IP")||
         request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()||
         "unknown";
}

function sanitize(str){
  return(str||"").replace(/[<>]/g,"").slice(0,200);
}

/* ── List Reports ── */
async function listReports(env){
  await ensureSchema(env);
  const now=new Date().toISOString();
  const {results}=await env.DB.prepare(
    "SELECT id,lat,lng,severity,note,created,flags,deleted FROM reports WHERE deleted=0 AND expires>?"
  ).bind(now).all();
  return new Response(JSON.stringify({reports:results}),{headers:{"Content-Type":"application/json",...corsHeaders()}});
}

/* ── Create Report ── */
async function createReport(request,env){
  await ensureSchema(env);

  const body=await request.json();
  const{lat,lng,severity,note,photo}=body;

  // Validate coordinates (rough Jorhat bounds)
  if(typeof lat!=="number"||typeof lng!=="number"||
     lat<26.4||lat>27.1||lng<93.8||lng>94.6){
    return new Response(JSON.stringify({error:"Coordinates outside Jorhat area"}),{status:400,headers:{"Content-Type":"application/json",...corsHeaders()}});
  }

  // Validate severity
  const sev=Math.max(1,Math.min(3,Math.floor(Number(severity)||3)));

  // Rate limiting (salted IP hash)
  const ip=getClientIp(request);
  const salt=env.IP_SALT||"aquaroute-default-salt";
  const ipHash=hashIp(ip,salt);
  const oneHourAgo=new Date(Date.now()-3600000).toISOString();
  const {results:recentCount}=await env.DB.prepare(
    "SELECT COUNT(*) as c FROM reports WHERE ip_hash=? AND created>?"
  ).bind(ipHash,oneHourAgo).all();
  if(recentCount[0]?.c>=5){
    return new Response(JSON.stringify({error:"Rate limit exceeded"}),{status:429,headers:{"Content-Type":"application/json",...corsHeaders()}});
  }

  const id=generateId();
  const token=generateToken();
  const now=new Date().toISOString();
  const expires=new Date(Date.now()+12*60*60*1000).toISOString();

  // Handle photo (R2 storage if available, else skip)
  let photoUrl=null;
  let photoPath=null;
  if(photo&&photo.data&&env.R2_BUCKET){
    photoPath=`reports/${id}.jpg`;
    const bin=Uint8Array.from(atob(photo.data),c=>c.charCodeAt(0));
    await env.R2_BUCKET.put(photoPath,bin,{
      httpMetadata:{contentType:"image/jpeg"},
      metadata:{reportId:id,uploaded:now}
    });
    photoUrl=`/api/photo/${id}`;
  }

  await env.DB.prepare(
    "INSERT INTO reports(id,lat,lng,severity,note,photo_url,photo_path,created,expires,ip_hash) VALUES(?,?,?,?,?,?,?,?,?,?)"
  ).bind(id,lat,lng,sev,sanitize(note),photoUrl,photoPath,now,expires,ipHash).run();

  await env.DB.prepare(
    "INSERT INTO tokens(report_id,token) VALUES(?,?)"
  ).bind(id,token).run();

  return new Response(JSON.stringify({id,token}),{headers:{"Content-Type":"application/json",...corsHeaders()}});
}

/* ── Delete Report ── */
async function deleteReport(id,request,env){
  await ensureSchema(env);
  const body=await request.json();
  const{token}=body;

  if(!token){
    return new Response(JSON.stringify({error:"Token required"}),{status:401,headers:{"Content-Type":"application/json",...corsHeaders()}});
  }

  // Constant-time token comparison
  const {results}=await env.DB.prepare(
    "SELECT token FROM tokens WHERE report_id=?"
  ).bind(id).all();

  let valid=false;
  for(const row of results){
    if(row.token.length===token.length){
      let diff=0;
      for(let i=0;i<row.token.length;i++){
        diff|=row.token.charCodeAt(i)^token.charCodeAt(i);
      }
      if(diff===0)valid=true;
    }
  }

  if(!valid){
    return new Response(JSON.stringify({error:"Invalid token"}),{status:403,headers:{"Content-Type":"application/json",...corsHeaders()}});
  }

  // Soft delete
  await env.DB.prepare("UPDATE reports SET deleted=1 WHERE id=?").bind(id).run();

  // Delete photo from R2
  const{results:report}=await env.DB.prepare("SELECT photo_path FROM reports WHERE id=?").bind(id).all();
  if(report[0]?.photo_path&&env.R2_BUCKET){
    await env.R2_BUCKET.delete(report[0].photo_path);
  }

  return new Response(JSON.stringify({ok:true}),{headers:{"Content-Type":"application/json",...corsHeaders()}});
}

/* ── Flag Report ── */
async function flagReport(id,env){
  await ensureSchema(env);
  await env.DB.prepare("UPDATE reports SET flags=flags+1 WHERE id=?").bind(id).run();

  // Auto-hide at 3 flags
  const{results}=await env.DB.prepare("SELECT flags FROM reports WHERE id=?").bind(id).all();
  if(results[0]?.flags>=3){
    await env.DB.prepare("UPDATE reports SET deleted=1 WHERE id=?").bind(id).run();
    // Delete photo too
    const{results:r}=await env.DB.prepare("SELECT photo_path FROM reports WHERE id=?").bind(id).all();
    if(r[0]?.photo_path&&env.R2_BUCKET){
      await env.R2_BUCKET.delete(r[0].photo_path);
    }
  }

  return new Response(JSON.stringify({ok:true,flags:results[0]?.flags||0}),{headers:{"Content-Type":"application/json",...corsHeaders()}});
}
