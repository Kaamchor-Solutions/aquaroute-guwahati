/* AquaRoute Guwahati: English and Assamese.
 *
 * The Assamese vocabulary follows the set already used in the Jorhat build so
 * the two apps do not drift into different words for the same thing: বৰষুণ for
 * rain, পথ for a route, বন্যা for flooding, প্ৰতিবেদন for a report.
 *
 * Measurements keep Western digits rather than Assamese numerals. Every figure
 * in this interface is set in a monospaced face and lines up in a column, and
 * mixing numeral systems breaks that alignment. The words around them are
 * translated; the numbers are not.
 *
 * A native speaker should read this before it goes in front of a real audience.
 * These are careful translations, not authoritative ones.
 */

const I18N = {
  en: {
    /* rain card */
    rain_over: 'Rain over Guwahati',
    rain_checking: 'Checking the sky',
    rain_checking_sub: 'Live rainfall, updated every ten minutes',
    rain_unit: 'mm/h peak',
    forecast_toggle: 'Show or hide the twelve hour forecast',
    detail_toggle: 'Show or hide the route detail',
    rain_feels: 'feels like',
    rain_humidity: 'humidity',
    mode_monsoon_now: 'Raining hard<br>right now',
    mode_monsoon_soon: 'Heavy rain due<br>within hours',
    mode_monsoon_sub: 'The hollows below fill fast.',
    mode_watch_now: 'Light rain<br>falling',
    mode_watch_soon: 'Rain expected<br>today',
    mode_watch_sub: 'Worth avoiding the worst spots.',
    mode_clear: 'Streets should<br>be clear',
    mode_clear_sub_none: 'No rain in the next twelve hours.',
    rain_unavailable: 'Rainfall unavailable',
    rain_unavailable_sub: 'Route checking still works. Treat every zone as risky.',

    /* route panel */
    edit: 'Edit',
    close: 'Close',
    from: 'From',
    to: 'To',
    from_ph: 'Zoo Road, Guwahati',
    to_ph: 'Six Mile, Guwahati',
    find_route: 'Find a dry route',
    finding: 'Looking at the water',
    where_going: 'Where are you going?',
    verdict_idle: 'Pick where you are going and I will tell you what the water is doing on the way.',
    verdict_none: 'No way through that we can find.',
    verdict_none_sub: 'Try a nearby landmark instead.',
    verdict_all_clear_a: 'Nothing is reported ',
    verdict_all_clear_em: 'anywhere',
    verdict_all_clear_b: ' on your way.',
    verdict_every_way: 'Every way we can find runs through ',
    verdict_only_way: 'The only way we can find runs through ',
    verdict_quickest: 'Your quickest way runs straight through ',
    verdict_no_detour: 'We are not going to invent a detour that does not exist. Waiting out the spell may beat driving it.',
    verdict_costs: 'There is one way round it. It costs ',
    verdict_costs_free: 'There is a way round it that costs you nothing.',
    verdict_take_quick: 'Take the quick one: ',
    minute: 'minute',
    minutes: 'minutes',
    tag_dry: 'Dry',
    tag_zone: 'zone',
    tag_zones: 'zones',
    tag_report: 'live report',
    tag_reports: 'live reports',
    tag_and: ' and ',

    /* zones */
    zones_title: 'Known waterlogging zones',
    zones_unverified: 'Unverified.',
    zones_provenance: ' These outlines were drawn around localities with a public reputation for waterlogging. They are not a drainage survey. If you know these streets, correct the map data and it updates.',
    zones_failed: 'The waterlogging zones could not be loaded, so routes cannot be checked against them.',
    live_report: 'live report',
    live_reports: 'live reports',

    /* tabs */
    tab_route: 'Route',
    tab_zones: 'Zones',
    tab_report: 'Report',
    tab_you: 'You',

    /* account */
    your_account: 'Your account',
    not_signed_in: 'Not signed in',
    sign_in: 'Sign in',
    sign_out: 'Sign out',
    my_reports: 'My reports',
    account_why: 'Reading the map needs no account, and neither does posting a report. Sign in only if you want to take your reports down later from any phone rather than only the one you posted them from.',
    signed_in_as: 'Signed in as ',
    signed_out: 'Signed out. The map still works.',

    /* sign in */
    auth_title: 'Sign in to report',
    auth_title_new: 'Create an account',
    auth_why: 'Reading the map needs nothing, and posting a report does not need an account either. Sign in only if you want your reports on every phone you use.',
    auth_why_report: 'You can post without signing in. Sign in only if you want to manage your reports from any phone.',
    auth_why_flag: 'Flagging helps a wrong report come off the map. No account needed.',
    auth_why_expired: 'Your session ran out. Sign in again.',
    auth_have: 'I have an account',
    auth_create: 'Create one',
    auth_google: 'Continue with Google',
    auth_or: 'or',
    your_name: 'Your name',
    your_name_ph: 'What should we call you?',
    email: 'Email',
    email_ph: 'you@example.com',
    password: 'Password',
    password_ph: 'At least ten characters',
    password_hint: 'Ten characters or more. A short sentence you will remember beats a short password you will not.',
    create_account: 'Create account',
    one_moment: 'One moment',
    auth_fineprint: 'Your password is never stored. Only a scrambled version of it is kept, and it cannot be turned back into your password. We ask for an email so you can get back in, and it is never shown next to your reports.',

    /* reporting */
    report_here: 'Report water here',
    finding_you: 'Finding you',
    no_location: 'Could not get your location. Drag the pin instead.',
    using_location: 'Using your current location',
    move_pin: 'Move the pin',
    how_bad: 'How bad is it?',
    sev_passable: 'Passable',
    sev_passable_sub: 'Wet, but you can drive it',
    sev_slow: 'Slow',
    sev_slow_sub: 'Crawling, water is deep',
    sev_impassable: 'Impassable',
    sev_impassable_sub: 'Turn around',
    sev_slow_going: 'Slow going',
    add_photo: 'Add a photo',
    add_photo_sub: 'Optional, but it is what makes a report believable',
    shrinking: 'Shrinking the photo on your phone',
    photo_failed: 'That photo could not be used. Try another, or post without one.',
    anything_add: 'Anything to add?',
    note_ph: 'Knee-deep outside the petrol pump',
    cancel: 'Cancel',
    post_report: 'Post report',
    posting: 'Posting',
    report_fineprint: 'Photos are shrunk and re-encoded on your phone before they are sent, which removes the GPS position and device details your camera writes into every picture. Every report disappears after twelve hours.',
    need_pin: 'Put the pin where the water is first.',
    need_sev: 'Choose how bad the water is.',
    report_thanks: 'Thank you. Your report is on the map for the next twelve hours.',

    /* my reports */
    your_reports: 'Your reports',
    fetching: 'Fetching',
    mine_empty: 'Nothing live right now. Anything you post shows up here for twelve hours.',
    mine_fineprint: 'Reports disappear on their own after twelve hours. Take one down sooner if the water has gone.',
    show: 'Show',
    take_down: 'Take down',
    removing: 'Removing',
    wont_delete: 'Would not delete',
    photo: 'photo',

    /* viewing one */
    not_accurate: 'Not accurate',
    delete_mine: 'Delete my report',
    deleted_ok: 'Deleted. It is off the map.',
    deleted_fail: 'That could not be deleted from this phone.',
    flag_thanks: 'Thank you. Enough of these and it comes off the map.',

    /* map + misc */
    map_down: 'The map cannot draw on this device.',
    map_timeout: 'The map is taking too long to load, which usually means this network is blocking it.',
    satellite: 'Satellite',
    streets: 'Streets',
    recentre: 'Back to Guwahati',
    no_geo: 'This browser will not share a location.',
    geo_refused: 'Location was refused. Type a place name instead.',
    just_now: 'just now',
    min_ago: 'min ago',
    h_ago: 'h ago',
    expires_in: 'expires in',
  },

  as: {
    /* rain card */
    rain_over: 'গুৱাহাটীৰ বৰষুণ',
    rain_checking: 'আকাশ চাই আছোঁ',
    rain_checking_sub: 'সজীৱ বৃষ্টিপাত, প্ৰতি দহ মিনিটত সতেজ',
    rain_unit: 'mm/h সৰ্বোচ্চ',
    forecast_toggle: 'বাৰ ঘণ্টাৰ পূৰ্বাভাস দেখুৱাওক বা লুকুওৱক',
    detail_toggle: 'পথৰ বিস্তাৰিত দেখুৱাওক বা লুকুওৱক',
    rain_feels: 'অনুভৱ হয়',
    rain_humidity: 'আৰ্দ্ৰতা',
    mode_monsoon_now: 'এতিয়া প্ৰবল<br>বৰষুণ',
    mode_monsoon_soon: 'কেইঘণ্টামানৰ ভিতৰত<br>প্ৰবল বৰষুণ',
    mode_monsoon_sub: 'তলৰ গাঁতবোৰ সোনকালে ভৰি যায়।',
    mode_watch_now: 'পাতল বৰষুণ<br>পৰি আছে',
    mode_watch_soon: 'আজি বৰষুণৰ<br>সম্ভাৱনা',
    mode_watch_sub: 'বেয়া ঠাইবোৰ এৰাই চলা ভাল।',
    mode_clear: 'পথ পৰিষ্কাৰ<br>থাকিব লাগে',
    mode_clear_sub_none: 'অহা বাৰ ঘণ্টাত বৰষুণ নাই।',
    rain_unavailable: 'বৃষ্টিপাতৰ তথ্য নাই',
    rain_unavailable_sub: 'পথ পৰীক্ষা এতিয়াও চলে। প্ৰতিটো অঞ্চল বিপদজনক বুলি ধৰক।',

    /* route panel */
    edit: 'সলনি',
    close: 'বন্ধ',
    from: 'ক\'ৰ পৰা',
    to: 'ক\'লৈ',
    from_ph: 'জু ৰোড, গুৱাহাটী',
    to_ph: 'ছিক্স মাইল, গুৱাহাটী',
    find_route: 'শুকান পথ বিচাৰক',
    finding: 'পানী চাই আছোঁ',
    where_going: 'ক\'লৈ যাব?',
    verdict_idle: 'ক\'লৈ যাব সেইটো বাছক, বাটত পানীৰ অৱস্থা কি সেয়া কম।',
    verdict_none: 'যাব পৰা কোনো পথ পোৱা নগ\'ল।',
    verdict_none_sub: 'ওচৰৰ চিনাকি ঠাই এটা দি চাওক।',
    verdict_all_clear_a: 'আপোনাৰ বাটৰ ',
    verdict_all_clear_em: 'কোনো ঠাইতে',
    verdict_all_clear_b: ' পানীৰ খবৰ নাই।',
    verdict_every_way: 'আমি পোৱা প্ৰতিটো পথেই যায় ',
    verdict_only_way: 'আমি পোৱা একমাত্ৰ পথটোৱে যায় ',
    verdict_quickest: 'আপোনাৰ সোনকালৰ পথটো সোজাকৈ যায় ',
    verdict_no_detour: 'নথকা ঘূৰণি পথ এটা আমি সাজি নিদিওঁ। বৰষুণ এৰাবলৈ ৰৈ যোৱাটোৱে ভাল হ\'ব পাৰে।',
    verdict_costs: 'ঘূৰি যোৱাৰ এটা পথ আছে। ইয়াত লাগে ',
    verdict_costs_free: 'ঘূৰি যোৱাৰ পথ এটা আছে, অতিৰিক্ত সময় নালাগে।',
    verdict_take_quick: 'সোনকালটো লওক: ',
    minute: 'মিনিট',
    minutes: 'মিনিট',
    tag_dry: 'শুকান',
    tag_zone: 'অঞ্চল',
    tag_zones: 'অঞ্চল',
    tag_report: 'সজীৱ প্ৰতিবেদন',
    tag_reports: 'সজীৱ প্ৰতিবেদন',
    tag_and: ' আৰু ',

    /* zones */
    zones_title: 'জ্ঞাত পানী জমা হোৱা অঞ্চল',
    zones_unverified: 'অসত্যাপিত।',
    zones_provenance: ' পানী জমা হোৱাৰ বাবে জনাজাত অঞ্চলবোৰৰ চাৰিওফালে এই সীমাৰেখা আঁকা হৈছে। ই কোনো নিকাশ সমীক্ষা নহয়। আপুনি এই পথবোৰ জানিলে তথ্য শুধৰাই দিব পাৰে, মানচিত্ৰ নিজেই সলনি হ\'ব।',
    zones_failed: 'পানী জমা হোৱা অঞ্চলবোৰ ল\'ড হোৱা নাই, সেয়েহে পথ পৰীক্ষা কৰিব নোৱাৰি।',
    live_report: 'সজীৱ প্ৰতিবেদন',
    live_reports: 'সজীৱ প্ৰতিবেদন',

    /* tabs */
    tab_route: 'পথ',
    tab_zones: 'অঞ্চল',
    tab_report: 'জনাওক',
    tab_you: 'আপুনি',

    /* account */
    your_account: 'আপোনাৰ একাউণ্ট',
    not_signed_in: 'ছাইন ইন কৰা নাই',
    sign_in: 'ছাইন ইন',
    sign_out: 'ছাইন আউট',
    my_reports: 'মোৰ প্ৰতিবেদন',
    account_why: 'মানচিত্ৰ চাবলৈ একাউণ্ট নালাগে, প্ৰতিবেদন দিবলৈও নালাগে। পিছত যিকোনো ফোনৰ পৰা নিজৰ প্ৰতিবেদন আঁতৰাবলৈহে ছাইন ইন কৰক।',
    signed_in_as: 'ছাইন ইন কৰা হৈছে: ',
    signed_out: 'ছাইন আউট হ\'ল। মানচিত্ৰ এতিয়াও চলে।',

    /* sign in */
    auth_title: 'প্ৰতিবেদন দিবলৈ ছাইন ইন কৰক',
    auth_title_new: 'একাউণ্ট খোলক',
    auth_why: 'মানচিত্ৰ চাবলৈ একো নালাগে, প্ৰতিবেদন দিবলৈও একাউণ্ট নালাগে। আপুনি ব্যৱহাৰ কৰা প্ৰতিটো ফোনতে প্ৰতিবেদন পাবলৈহে ছাইন ইন কৰক।',
    auth_why_report: 'ছাইন ইন নকৰাকৈয়ে প্ৰতিবেদন দিব পাৰে। যিকোনো ফোনৰ পৰা প্ৰতিবেদন চম্ভালিবলৈহে ছাইন ইন কৰক।',
    auth_why_flag: 'চিন দিলে ভুল প্ৰতিবেদন মানচিত্ৰৰ পৰা আঁতৰে। একাউণ্ট নালাগে।',
    auth_why_expired: 'আপোনাৰ ছেশ্বন শেষ হ\'ল। পুনৰ ছাইন ইন কৰক।',
    auth_have: 'মোৰ একাউণ্ট আছে',
    auth_create: 'নতুন খোলক',
    auth_google: 'গুগলৰ সৈতে আগবাঢ়ক',
    auth_or: 'নাইবা',
    your_name: 'আপোনাৰ নাম',
    your_name_ph: 'আপোনাক কি বুলি মাতিম?',
    email: 'ইমেইল',
    email_ph: 'you@example.com',
    password: 'পাছৱৰ্ড',
    password_ph: 'অন্ততঃ দহটা আখৰ',
    password_hint: 'দহটা বা তাতকৈ অধিক আখৰ। মনত ৰখা এটা সৰু বাক্য, মনত নথকা এটা সৰু পাছৱৰ্ডতকৈ ভাল।',
    create_account: 'একাউণ্ট খোলক',
    one_moment: 'অলপ ৰওক',
    auth_fineprint: 'আপোনাৰ পাছৱৰ্ড কেতিয়াও ৰখা নহয়। কেৱল ইয়াৰ এটা সাংকেতিক ৰূপহে ৰখা হয়, আৰু তাৰ পৰা পাছৱৰ্ড উলিয়াব নোৱাৰি। ঘূৰি আহিব পৰাকৈ ইমেইল বিচৰা হয়, আৰু সেয়া আপোনাৰ প্ৰতিবেদনৰ কাষত কেতিয়াও দেখুওৱা নহয়।',

    /* reporting */
    report_here: 'ইয়াত পানীৰ খবৰ দিয়ক',
    finding_you: 'আপোনাক বিচাৰি আছোঁ',
    no_location: 'আপোনাৰ স্থান পোৱা নগ\'ল। পিনটো টানি আনক।',
    using_location: 'আপোনাৰ বৰ্তমানৰ স্থান ব্যৱহাৰ কৰি আছোঁ',
    move_pin: 'পিন লৰাওক',
    how_bad: 'কিমান বেয়া?',
    sev_passable: 'যাব পাৰি',
    sev_passable_sub: 'ভিজা, কিন্তু গাড়ী চলাব পাৰি',
    sev_slow: 'লাহে লাহে',
    sev_slow_sub: 'বৰ লাহে, পানী গভীৰ',
    sev_impassable: 'যাব নোৱাৰি',
    sev_impassable_sub: 'ঘূৰি যাওক',
    sev_slow_going: 'লাহে লাহে যায়',
    add_photo: 'এখন ফটো দিয়ক',
    add_photo_sub: 'ঐচ্ছিক, কিন্তু ইয়েই প্ৰতিবেদনটো বিশ্বাসযোগ্য কৰে',
    shrinking: 'আপোনাৰ ফোনতে ফটোখন সৰু কৰি আছোঁ',
    photo_failed: 'ফটোখন ব্যৱহাৰ কৰিব পৰা নগ\'ল। আন এখন দিয়ক, বা ফটো নিদিয়াকৈ পঠিয়াওক।',
    anything_add: 'আৰু কিবা ক\'বলৈ আছে?',
    note_ph: 'পেট্ৰল পাম্পৰ সন্মুখত আঠুৱে পানী',
    cancel: 'বাতিল',
    post_report: 'প্ৰতিবেদন দিয়ক',
    posting: 'পঠিয়াই আছোঁ',
    report_fineprint: 'পঠিওৱাৰ আগতে ফটোবোৰ আপোনাৰ ফোনতে সৰু কৰি পুনৰ সংকেতিত কৰা হয়, ইয়াৰ ফলত কেমেৰাই লিখা GPS স্থান আৰু ডিভাইচৰ তথ্য আঁতৰি যায়। প্ৰতিটো প্ৰতিবেদন বাৰ ঘণ্টাৰ পিছত মচি যায়।',
    need_pin: 'প্ৰথমে পানী থকা ঠাইত পিনটো থওক।',
    need_sev: 'পানী কিমান বেয়া সেয়া বাছক।',
    report_thanks: 'ধন্যবাদ। আপোনাৰ প্ৰতিবেদন অহা বাৰ ঘণ্টাৰ বাবে মানচিত্ৰত থাকিব।',

    /* my reports */
    your_reports: 'আপোনাৰ প্ৰতিবেদন',
    fetching: 'আনি আছোঁ',
    mine_empty: 'এতিয়া একো সজীৱ নাই। আপুনি দিয়া প্ৰতিবেদন ইয়াত বাৰ ঘণ্টাৰ বাবে দেখা যাব।',
    mine_fineprint: 'প্ৰতিবেদনবোৰ বাৰ ঘণ্টাৰ পিছত নিজেই মচি যায়। পানী নাইকিয়া হ\'লে আগতেই আঁতৰাই দিব পাৰে।',
    show: 'দেখুৱাওক',
    take_down: 'আঁতৰাওক',
    removing: 'আঁতৰাই আছোঁ',
    wont_delete: 'মচা নগ\'ল',
    photo: 'ফটো',

    /* viewing one */
    not_accurate: 'শুদ্ধ নহয়',
    delete_mine: 'মোৰ প্ৰতিবেদন মচক',
    deleted_ok: 'মচা হ\'ল। মানচিত্ৰৰ পৰা আঁতৰিল।',
    deleted_fail: 'এই ফোনৰ পৰা মচিব পৰা নগ\'ল।',
    flag_thanks: 'ধন্যবাদ। এনে কেইটামান হ\'লে ই মানচিত্ৰৰ পৰা আঁতৰি যাব।',

    /* map + misc */
    map_down: 'এই ডিভাইচত মানচিত্ৰ আঁকিব নোৱাৰি।',
    map_timeout: 'মানচিত্ৰ ল\'ড হ\'বলৈ বৰ সময় লৈছে, সাধাৰণতে ইয়াৰ অৰ্থ এই নেটৱৰ্কে ইয়াক বাধা দিছে।',
    satellite: 'উপগ্ৰহ',
    streets: 'পথ',
    recentre: 'গুৱাহাটীলৈ ঘূৰি যাওক',
    no_geo: 'এই ব্ৰাউজাৰে স্থান শ্বেয়াৰ নকৰে।',
    geo_refused: 'স্থান দিবলৈ অস্বীকাৰ কৰিলে। ঠাইৰ নাম লিখক।',
    just_now: 'এইমাত্ৰ',
    min_ago: 'মিনিট আগতে',
    h_ago: 'ঘণ্টা আগতে',
    expires_in: 'শেষ হ\'ব',
  },
};

/* The choice sticks, because somebody who reads Assamese does not want to pick
   it again every time it rains. */
const LANG_KEY = 'aquaroute.lang';

let currentLang = 'en';
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'as' || saved === 'en') currentLang = saved;
} catch { /* private browsing: English it is */ }

function t(key) {
  const table = I18N[currentLang] || I18N.en;
  return table[key] !== undefined ? table[key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
}

const lang = () => currentLang;

function applyLang(next) {
  currentLang = next;
  try { localStorage.setItem(LANG_KEY, next); } catch { /* nothing to do */ }

  document.documentElement.setAttribute('lang', next === 'as' ? 'as' : 'en');
  document.documentElement.setAttribute('data-lang', next);

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  // A few strings carry a deliberate line break, so they are set as markup.
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-ph'));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });

  const btn = document.getElementById('langBtn');
  if (btn) {
    btn.textContent = next === 'en' ? 'অস' : 'EN';
    btn.setAttribute('aria-label', next === 'en' ? 'ভাষা অসমীয়ালৈ সলনি কৰক' : 'Switch language to English');
  }

  // Anything already painted from data has to be repainted in the new language.
  if (typeof onLanguageChange === 'function') onLanguageChange();
}
