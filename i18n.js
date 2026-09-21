const I18N={
  en:{
    alert_clear:"Clear",
    alert_watch:"Watch",
    alert_monsoon:"Monsoon",
    placeholder_from:"Starting point",
    placeholder_to:"Destination",
    check_route:"Check Route",
    clear:"Clear",
    rainfall_title:"Rainfall",
    rain_now:"Now",
    rain_next_1h:"Next 1h",
    rain_next_3h:"Next 3h",
    rain_next_6h:"Next 6h",
    report_flood:"Report Flooding",
    report_form_title:"Report Flooding",
    report_note:"Your photo is re-encoded to remove location data.",
    severity:"Severity",
    optional_note:"Note (optional)",
    note_placeholder:"e.g. Near junction, traffic stopped",
    photo_optional:"Photo (optional)",
    submit_report:"Submit Report",
    cancel:"Cancel",
    disclaimer:"Zones derived from NDEM satellite data (1998-2022). May not reflect current drainage.",
    map_timeout:"Map could not load. Check your connection.",
    route_clear:"Clear route — no flood zones crossed",
    route_caution:"Caution — route passes through flood-prone areas",
    route_danger:"Danger — route crosses active flood zones",
    zones_crossed:"zones crossed",
    locating:"Locating...",
    report_thanks:"Report submitted. Thank you.",
    report_error:"Could not submit report. Try again.",
    report_rate:"Too many reports. Wait a few minutes.",
    report_bad_coords:"Could not find your location. Pin it on the map.",
    loading:"Loading...",
    delete_report:"Delete my report",
    report_deleted:"Report deleted.",
    delete_error:"Could not delete."
  },
  as:{
    alert_clear:"স্বচ্ছ",
    alert_watch:"সতর্ক",
    alert_monsoon:"বৰষুণ",
    placeholder_from:"আৰম্ভণি স্থান",
    placeholder_to:"গন্তব্য",
    check_route:"পথ পৰীক্ষা কৰক",
    clear:"পৰিষ্কাৰ",
    rainfall_title:"বৃষ্টিপাত",
    rain_now:"এতিয়া",
    rain_next_1h:"পৰৱৰ্তী ১ ঘণ্টা",
    rain_next_3h:"পৰৱৰ্তী ৩ ঘণ্টা",
    rain_next_6h:"পৰৱৰ্তী ৬ ঘণ্টা",
    report_flood:"বন্যা জনাও",
    report_form_title:"বন্যা জনাও",
    report_note:"আপোনাৰ ফটো স্থানৰ তথ্য আঁতৰাবলৈ পুনৰ সংকোচন কৰা হৈছে।",
    severity:"গুৰুত্ব",
    optional_note:"টোকা (ঐচ্ছিক)",
    note_placeholder:"যেনে: চতৰ ওলোটো, ট্ৰাফিক বন্ধ",
    photo_optional:"ফটো (ঐচ্ছিক)",
    submit_report:"প্ৰতিবেদন দিয়ক",
    cancel:"বাতিল",
    disclaimer:"অঞ্চলসমূহ NDEM ছেটেলাইট তথ্যৰ পৰা প্ৰাপ্ত (1998-2022)। বৰ্তমান নিকাশ পৰিস্থিতি প্ৰতিফলিত নাবাপাব পাৰে।",
    map_timeout:"মানচিত্ৰ ল'ড হ'ল নহিল। আপোনাৰ সংযোগ পৰীক্ষা কৰক।",
    route_clear:"পথ পৰিষ্কাৰ — কোনো বন্যা অঞ্চল পাৰ হোৱা নাই",
    route_caution:"সতৰ্ক — পথে বন্যা-প্ৰৱণ অঞ্চল পাৰ হয়",
    route_danger:"বিপদ — পথে সক্ৰিয় বন্যা অঞ্চল পাৰ হয়",
    zones_crossed:"টা অঞ্চল পাৰ",
    locating:"স্থান নিৰ্ণয় কৰি আছে...",
    report_thanks:"প্ৰতিবেদন দিয়া হৈছে। ধন্যবাদ।",
    report_error:"প্ৰতিবেদন দিয়া নগ'ল। পুনৰ চেষ্টা কৰক।",
    report_rate:"বেছি প্ৰতিবেদন। কিছু মিনিট অপেক্ষা কৰক।",
    report_bad_coords:"আপোনাৰ স্থান পোৱা নগ'ল। মানচিত্ৰত পিন কৰক।",
    loading:"ল'ড হৈ আছে...",
    delete_report:"মোৰ প্ৰতিবেদন মচক",
    report_deleted:"প্ৰতিবেদন মচা হৈছে।",
    delete_error:"মচা নগ'ল।"
  }
};

let currentLang="en";

function t(key){return(I18N[currentLang]||I18N.en)[key]||key}

function applyLang(lang){
  currentLang=lang;
  document.documentElement.setAttribute("data-lang",lang);
  document.documentElement.setAttribute("lang",lang==="as"?"as":"en");
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    el.textContent=t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{
    el.placeholder=t(el.getAttribute("data-i18n-placeholder"));
  });
  document.getElementById("btn-lang").textContent=lang==="en"?"EN":"অস"};
