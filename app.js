(function(){
"use strict";

/* ── Config ── */
const JORHAT={lat:26.7578,lng:94.2098,zoom:13};
const RATE_LIMIT_MS=1200;
const REPORT_EXPIRY_MS=12*60*60*1000;
const LOCAL_MODE=true;

let map=null;
let lastRouteFetch=0;
let userLat=null,userLng=null;

/* ── Init ── */
document.addEventListener("DOMContentLoaded",()=>{
  initMap();
  initSheet();
  initLang();
  initLocate();
  initRoute();
  initReport();
  fetchRainfall();
  setInterval(fetchRainfall,10*60*1000);
});

/* ── Map ── */
function initMap(){
  map=new maplibregl.Map({
    container:"map",
    style:"https://tiles.openfreemap.org/styles/liberty",
    center:[JORHAT.lng,JORHAT.lat],
    zoom:JORHAT.zoom,
    attributionControl:false
  });
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");
  map.on("error",e=>console.warn("Map error:",e));

  map.on("load",()=>{
    loadFloodZones();
    addReportSource();
    refreshReports();
    setInterval(refreshReports,5*60*1000);
  });

  setTimeout(()=>{
    if(!map.loaded()){
      document.getElementById("map-timeout").hidden=false;
    }
  },12000);
}

/* ── Flood Zones ── */
function loadFloodZones(){
  fetch("flood-zones-jorhat.geojson").then(r=>r.json()).then(geojson=>{
    map.addSource("flood-zones",{type:"geojson",data:geojson});

    map.addLayer({
      id:"flood-fill",
      type:"fill",
      source:"flood-zones",
      paint:{
        "fill-color":[
          "case",
          ["==",["get","severity"],"severe"],"rgba(239,68,68,0.25)",
          ["==",["get","severity"],"moderate"],"rgba(245,158,11,0.2)",
          "rgba(59,130,246,0.15)"
        ],
        "fill-opacity":0.55
      }
    });

    map.addLayer({
      id:"flood-outline",
      type:"line",
      source:"flood-zones",
      paint:{
        "line-color":[
          "case",
          ["==",["get","severity"],"severe"],"rgba(239,68,68,0.6)",
          ["==",["get","severity"],"moderate"],"rgba(245,158,11,0.5)",
          "rgba(59,130,246,0.4)"
        ],
        "line-width":1.5
      }
    });

    map.on("click","flood-fill",e=>{
      if(!e.features||!e.features.length)return;
      const p=e.features[0].properties;
      new maplibregl.Popup({closeButton:false})
        .setLngLat(e.lngLat)
        .setHTML('<div style="font-size:13px;line-height:1.5"><b>'+esc(p.name||"Flood zone")+'</b><br>'+esc(p.note||"")+'<br><span style="color:#8b8f9e;font-size:11px">Severity: '+esc(p.severity||"?")+' | Source: NDEM/NRSC</span></div>')
        .addTo(map);
    });

    map.on("mouseenter","flood-fill",()=>{map.getCanvas().style.cursor="pointer"});
    map.on("mouseleave","flood-fill",()=>{map.getCanvas().style.cursor=""});

    console.log("Loaded",geojson.features.length,"flood zones");
  }).catch(e=>console.warn("Flood zones load failed:",e));
}

/* ── Reports Layer ── */
function addReportSource(){
  map.addSource("reports",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  map.addLayer({
    id:"report-points",
    type:"circle",
    source:"reports",
    paint:{
      "circle-radius":["case",["==",["get","severity"],1],6,["==",["get","severity"],2],8,10],
      "circle-color":["case",["==",["get","severity"],1],"#3b82f6",["==",["get","severity"],2],"#f59e0b","#ef4444"],
      "circle-stroke-color":"#0f1117",
      "circle-stroke-width":2
    }
  });
  map.on("click","report-points",e=>{
    if(!e.features||!e.features.length)return;
    const p=e.features[0].properties;
    const stored=localStorage.getItem("report_token_"+p.id);
    const delBtn=stored?'<br><button onclick="window._delReport(\''+p.id+'\')" style="margin-top:6px;padding:4px 10px;border:1px solid #ef4444;border-radius:6px;background:transparent;color:#ef4444;font-size:12px;cursor:pointer">'+t("delete_report")+'</button>':"";
    new maplibregl.Popup({closeButton:false})
      .setLngLat(e.lngLat)
      .setHTML('<div style="font-size:13px;line-height:1.5"><b>Report</b><br>Severity: '+(p.severity||1)+'<br>'+esc(p.note||"")+'<br><span style="color:#8b8f9e;font-size:11px">'+timeAgo(p.created)+'</span>'+delBtn+'</div>')
      .addTo(map);
  });
}

window._delReport=function(id){
  if(!confirm("Delete this report?"))return;
  if(LOCAL_MODE){
    var reports=JSON.parse(localStorage.getItem("local_reports")||"[]");
    reports=reports.filter(r=>r.id!==id);
    localStorage.setItem("local_reports",JSON.stringify(reports));
    refreshReports();
    alert(t("report_deleted"));
  }
};

function refreshReports(){
  if(!map||!map.getSource("reports"))return;
  if(LOCAL_MODE){
    var now=Date.now();
    var reports=JSON.parse(localStorage.getItem("local_reports")||"[]");
    var features=reports.filter(r=>now-r.created<REPORT_EXPIRY_MS).map(function(r){
      var stored=localStorage.getItem("report_token_"+r.id);
      return{
        type:"Feature",
        geometry:{type:"Point",coordinates:[r.lng,r.lat]},
        properties:{id:r.id,severity:r.severity,note:r.note||"",created:String(r.created),token:stored||null}
      };
    });
    map.getSource("reports").setData({type:"FeatureCollection",features:features});
  }
}

/* ── Bottom Sheet ── */
function initSheet(){
  var sheet=document.getElementById("sheet");
  var handle=document.getElementById("sheet-handle");
  var didDrag=false;

  handle.addEventListener("touchstart",function(){didDrag=false},{passive:true});
  handle.addEventListener("touchmove",function(){didDrag=true},{passive:true});
  handle.addEventListener("click",function(e){
    if(didDrag)return;
    if(sheet.classList.contains("sheet-collapsed")){
      sheet.classList.remove("sheet-collapsed");
      sheet.classList.add("sheet-expanded");
      refreshReports();
    }else{
      sheet.classList.remove("sheet-expanded");
      sheet.classList.add("sheet-collapsed");
    }
  });
}

/* ── Language ── */
function initLang(){
  document.getElementById("btn-lang").addEventListener("click",function(){
    applyLang(currentLang==="en"?"as":"en");
  });
  applyLang("en");
}

/* ── Geolocation ── */
function initLocate(){
  document.getElementById("btn-locate").addEventListener("click",function(){
    if(!navigator.geolocation)return;
    navigator.geolocation.getCurrentPosition(function(pos){
      userLat=pos.coords.latitude;
      userLng=pos.coords.longitude;
      map.flyTo({center:[userLng,userLat],zoom:14});
    },function(){},{enableHighAccuracy:true,timeout:10000});
  });
  if(navigator.geolocation){
    navigator.geolocation.watchPosition(function(pos){
      userLat=pos.coords.latitude;
      userLng=pos.coords.longitude;
    },function(){},{enableHighAccuracy:true,timeout:30000,maximumAge:60000});
  }
}

/* ── Route ── */
function initRoute(){
  document.getElementById("btn-route").addEventListener("click",checkRoute);
  document.getElementById("btn-clear-route").addEventListener("click",clearRoute);
  document.getElementById("input-to").addEventListener("keydown",function(e){if(e.key==="Enter")checkRoute()});
  document.getElementById("input-from").addEventListener("keydown",function(e){if(e.key==="Enter")document.getElementById("input-to").focus()});
}

async function checkRoute(){
  var fromText=document.getElementById("input-from").value.trim();
  var toText=document.getElementById("input-to").value.trim();
  if(!fromText||!toText)return;

  var now=Date.now();
  if(now-lastRouteFetch<RATE_LIMIT_MS)return;
  lastRouteFetch=now;

  var resultDiv=document.getElementById("route-result");
  var verdictDiv=document.getElementById("route-verdict");
  var detailDiv=document.getElementById("route-detail");
  resultDiv.hidden=true;

  try{
    var fromCoords=await geocode(fromText);
    await sleep(1200);
    var toCoords=await geocode(toText);

    if(!fromCoords||!toCoords){
      verdictDiv.className="verdict-danger";
      verdictDiv.textContent="Could not find one or both locations.";
      detailDiv.textContent="";
      resultDiv.hidden=false;
      return;
    }

    var routeUrl="https://router.project-osrm.org/route/v1/driving/"+fromCoords.lng+","+fromCoords.lat+";"+toCoords.lng+","+toCoords.lat+"?overview=full&geometries=geojson&alternatives=true";
    var routeRes=await fetch(routeUrl);
    var routeData=await routeRes.json();

    if(!routeData.routes||!routeData.routes.length){
      verdictDiv.className="verdict-danger";
      verdictDiv.textContent="No route found between these points.";
      detailDiv.textContent="";
      resultDiv.hidden=false;
      return;
    }

    var floodPolys=await getFloodPolygons();
    var results=routeData.routes.map(function(r){
      var coords=r.geometry.coordinates;
      var crossingZones=new Set();
      for(var pi=0;pi<floodPolys.length;pi++){
        var poly=floodPolys[pi].coords;
        for(var ci=0;ci<coords.length;ci++){
          if(pointInPolygon(coords[ci],poly)){
            crossingZones.add(floodPolys[pi].id);
            break;
          }
        }
      }
      return{route:r,crossings:crossingZones.size};
    });

    results.sort(function(a,b){return a.crossings-b.crossings});

    var best=results[0];
    if(best.crossings===0){
      verdictDiv.className="verdict-clear";
      verdictDiv.textContent=t("route_clear");
      detailDiv.textContent="";
    }else if(best.crossings<=2){
      verdictDiv.className="verdict-caution";
      verdictDiv.textContent=t("route_caution")+" — "+best.crossings+" "+t("zones_crossed");
      detailDiv.textContent=results.length+" route alternatives checked.";
    }else{
      verdictDiv.className="verdict-danger";
      verdictDiv.textContent=t("route_danger")+" — "+best.crossings+" "+t("zones_crossed");
      var clearRoutes=results.filter(function(r){return r.crossings===0});
      detailDiv.textContent=clearRoutes.length?clearRoutes.length+" clear alternative(s) found.":"All "+results.length+" alternatives cross flood zones.";
    }

    drawRoute(best.route.geometry);
    addMarker(fromCoords,"#22c55e");
    addMarker(toCoords,"#ef4444");
    resultDiv.hidden=false;

  }catch(err){
    console.error("Route error:",err);
    verdictDiv.className="verdict-danger";
    verdictDiv.textContent="Route check failed. Try again.";
    detailDiv.textContent="";
    resultDiv.hidden=false;
  }
}

function clearRoute(){
  document.getElementById("route-result").hidden=true;
  document.getElementById("input-from").value="";
  document.getElementById("input-to").value="";
  if(map.getLayer("route-line"))map.removeLayer("route-line");
  if(map.getSource("route"))map.removeSource("route");
  document.querySelectorAll(".maplibregl-marker").forEach(function(m){m.remove()});
}

function addMarker(coords,color){
  var el=document.createElement("div");
  el.style.cssText="width:14px;height:14px;border-radius:50%;background:"+color+";border:3px solid #0f1117;box-shadow:0 0 8px rgba(0,0,0,.5)";
  new maplibregl.Marker({element:el}).setLngLat(coords).addTo(map);
}

function drawRoute(geom){
  if(map.getLayer("route-line"))map.removeLayer("route-line");
  if(map.getSource("route"))map.removeSource("route");
  map.addSource("route",{type:"geojson",data:{type:"Feature",geometry:geom}});
  map.addLayer({id:"route-line",type:"line",source:"route",paint:{"line-color":"#22c55e","line-width":4,"line-opacity":0.85}});
}

/* ── Geocoding ── */
async function geocode(query){
  var url="https://nominatim.openstreetmap.org/search?q="+encodeURIComponent(query)+"&format=json&limit=1&countrycodes=in";
  var res=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"AquaRouteJorhat/1.0"}});
  var data=await res.json();
  if(data&&data.length){
    return{lat:parseFloat(data[0].lat),lng:parseFloat(data[0].lon)};
  }
  return null;
}

/* ── Flood polygon data ── */
var cachedFloodPolys=null;

async function getFloodPolygons(){
  if(cachedFloodPolys)return cachedFloodPolys;
  try{
    var res=await fetch("flood-zones-jorhat.geojson");
    var geojson=await res.json();
    cachedFloodPolys=geojson.features.map(function(f){
      return{id:f.properties.id,coords:f.geometry.coordinates[0]};
    });
    return cachedFloodPolys;
  }catch(e){
    cachedFloodPolys=[];
    return cachedFloodPolys;
  }
}

/* ── Point in polygon (ray casting) ── */
function pointInPolygon(point,polygon){
  var x=point[0],y=point[1];
  var inside=false;
  for(var i=0,j=polygon.length-1;i<polygon.length;j=i++){
    var xi=polygon[i][0],yi=polygon[i][1];
    var xj=polygon[j][0],yj=polygon[j][1];
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)){
      inside=!inside;
    }
  }
  return inside;
}

/* ── Rainfall ── */
async function fetchRainfall(){
  try{
    var url="https://api.open-meteo.com/v1/forecast?latitude="+JORHAT.lat+"&longitude="+JORHAT.lng+"&current=precipitation&hourly=precipitation&forecast_days=1&timezone=Asia/Kolkata";
    var res=await fetch(url);
    var data=await res.json();

    var now=data.current&&data.current.precipitation?data.current.precipitation:0;
    var hourly=data.hourly&&data.hourly.precipitation?data.hourly.precipitation:[];
    var nowIdx=data.hourly&&data.hourly.time?new Date().getHours():0;

    var h1=0,h3=0,h6=0;
    for(var i=nowIdx;i<Math.min(nowIdx+6,hourly.length);i++){
      var v=hourly[i]||0;
      if(i<nowIdx+1)h1+=v;
      if(i<nowIdx+3)h3+=v;
      if(i<nowIdx+6)h6+=v;
    }

    document.getElementById("rain-current").textContent=now.toFixed(1)+" mm";
    document.getElementById("rain-1h").textContent=h1.toFixed(1)+" mm";
    document.getElementById("rain-3h").textContent=h3.toFixed(1)+" mm";
    document.getElementById("rain-6h").textContent=h6.toFixed(1)+" mm";

    [document.getElementById("rain-current"),document.getElementById("rain-1h"),document.getElementById("rain-3h"),document.getElementById("rain-6h")].forEach(function(el){
      var v=parseFloat(el.textContent);
      el.classList.toggle("heavy",v>=5);
    });

    updateAlert(now,h1,h3,h6);
  }catch(e){
    console.warn("Rainfall fetch failed:",e);
  }
}

function updateAlert(now,h1,h3,h6){
  var badge=document.getElementById("alert-badge");
  var text=document.getElementById("alert-text");
  badge.className="";
  if(h6>=20||h3>=12||(now>=5&&h3>=8)){
    badge.classList.add("alert-monsoon");
    text.textContent=t("alert_monsoon");
  }else if(h3>=4||h6>=8||(now>=2&&h1>=3)){
    badge.classList.add("alert-watch");
    text.textContent=t("alert_watch");
  }else{
    badge.classList.add("alert-clear");
    text.textContent=t("alert_clear");
  }
}

/* ── Reporting ── */
function initReport(){
  var btnOpen=document.getElementById("btn-report");
  var form=document.getElementById("report-form");
  var btnCancel=document.getElementById("btn-cancel-report");
  var btnSubmit=document.getElementById("btn-submit-report");
  var photoInput=document.getElementById("report-photo");
  var photoPreview=document.getElementById("photo-preview");
  var photoImg=document.getElementById("photo-preview-img");

  document.querySelectorAll(".sev-btn").forEach(function(btn){
    btn.addEventListener("click",function(){
      document.querySelectorAll(".sev-btn").forEach(function(b){b.classList.remove("active")});
      btn.classList.add("active");
    });
  });

  btnOpen.addEventListener("click",function(){
    form.hidden=false;
    btnOpen.hidden=true;
    var sheet=document.getElementById("sheet");
    sheet.classList.remove("sheet-collapsed");
    sheet.classList.add("sheet-expanded");
  });

  btnCancel.addEventListener("click",function(){
    form.hidden=true;
    btnOpen.hidden=false;
  });

  photoInput.addEventListener("change",function(e){
    var file=e.target.files[0];
    if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){
      photoImg.src=ev.target.result;
      photoPreview.hidden=false;
    };
    reader.readAsDataURL(file);
  });

  btnSubmit.addEventListener("click",submitReport);
}

async function submitReport(){
  var btnSubmit=document.getElementById("btn-submit-report");
  btnSubmit.disabled=true;
  btnSubmit.textContent=t("loading");

  try{
    var lat=userLat,lng=userLng;
    if(!lat||!lng){
      var pos=await new Promise(function(res,rej){
        navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:10000});
      });
      lat=pos.coords.latitude;
      lng=pos.coords.longitude;
    }

    if(lat<26.4||lat>27.1||lng<93.8||lng>94.6){
      alert(t("report_bad_coords"));
      return;
    }

    var severity=parseInt(document.querySelector(".sev-btn.active").getAttribute("data-severity")||"3");
    var note=document.getElementById("report-note").value.trim();

    if(LOCAL_MODE){
      var id=crypto.randomUUID().replace(/-/g,"").slice(0,16);
      var token=crypto.randomUUID().replace(/-/g,"");
      var report={id:id,lat:lat,lng:lng,severity:severity,note:note,created:Date.now()};
      var reports=JSON.parse(localStorage.getItem("local_reports")||"[]");
      reports.push(report);
      localStorage.setItem("local_reports",JSON.stringify(reports));
      localStorage.setItem("report_token_"+id,token);
    }

    alert(t("report_thanks"));
    document.getElementById("report-form").hidden=true;
    document.getElementById("btn-report").hidden=false;
    document.getElementById("report-note").value="";
    document.getElementById("report-photo").value="";
    document.getElementById("photo-preview").hidden=true;
    refreshReports();

  }catch(e){
    console.error("Report error:",e);
    alert(t("report_error"));
  }finally{
    btnSubmit.disabled=false;
    btnSubmit.textContent=t("submit_report");
  }
}

/* ── Helpers ── */
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}

function timeAgo(val){
  var ts=typeof val==="number"?val:parseInt(val,10);
  if(isNaN(ts))return"";
  var diff=Date.now()-ts;
  var mins=Math.floor(diff/60000);
  if(mins<1)return"just now";
  if(mins<60)return mins+"m ago";
  var hrs=Math.floor(mins/60);
  if(hrs<24)return hrs+"h ago";
  return Math.floor(hrs/24)+"d ago";
}

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

})();
