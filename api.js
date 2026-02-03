/* api.js — единая точка работы с Supabase/Edge Functions.
   Важно: Service Role ключа тут НЕТ и быть не должно.
*/
(function(){
  "use strict";

  // === Настройки ===
  // Поменяй на свои значения (оставь, если это твой текущий проект)
  var SUPABASE_REST_URL = "https://jcnusmqellszoiuupaat.supabase.co/rest/v1";
  var SUPABASE_ANON_KEY = "REPLACE_ME_ANON_KEY";
  var FN_ENQUEUE = "https://jcnusmqellszoiuupaat.functions.supabase.co/enqueue_request";
  var FN_ESTIMATES = "https://jcnusmqellszoiuupaat.functions.supabase.co/estimates";
  var FN_GET_PROFILE = "https://jcnusmqellszoiuupaat.functions.supabase.co/get_profile";
  var FN_RESERVE_PROMO = "https://jcnusmqellszoiuupaat.functions.supabase.co/reserve_promo";

  try {
    var cfg = window.__CONFIG__ || {};
    if (cfg.SUPABASE_REST_URL) SUPABASE_REST_URL = String(cfg.SUPABASE_REST_URL);
    if (cfg.SUPABASE_ANON_KEY) SUPABASE_ANON_KEY = String(cfg.SUPABASE_ANON_KEY);
    if (cfg.FN_ENQUEUE) FN_ENQUEUE = String(cfg.FN_ENQUEUE);
    if (cfg.FN_ESTIMATES) FN_ESTIMATES = String(cfg.FN_ESTIMATES);
    if (cfg.FN_GET_PROFILE) FN_GET_PROFILE = String(cfg.FN_GET_PROFILE);
    if (cfg.FN_RESERVE_PROMO) FN_RESERVE_PROMO = String(cfg.FN_RESERVE_PROMO);
  } catch(_) {}

  function timeoutPromise(ms){
    return new Promise(function(_,rej){ setTimeout(function(){ rej(new Error("timeout")); }, ms); });
  }
  function safeJsonParse(txt){ try { return JSON.parse(txt); } catch(_) { return null; } }

  function fetchJson(url, opts, ms){
    if (!ms) ms = 12000;
    return Promise.race([fetch(url, opts), timeoutPromise(ms)]).then(function(res){
      return res.text().then(function(raw){
        var data = safeJsonParse(raw);
        if (!res.ok) {
          var msg = (data && (data.error || data.message)) ? (data.error || data.message) : ("HTTP " + res.status);
          var e = new Error(msg);
          e.status = res.status; e.raw = raw;
          throw e;
        }
        return data;
      });
    });
  }

  function sbHeaders(){
    return {
      "content-type":"application/json",
      "apikey": SUPABASE_ANON_KEY,
      "authorization": "Bearer " + SUPABASE_ANON_KEY,
      "accept":"application/json"
    };
  }

  function enqueueRequest(kind, payload, tg_id){
    return fetchJson(FN_ENQUEUE, {
      method:"POST", mode:"cors", headers: sbHeaders(),
      body: JSON.stringify({ kind: String(kind||""), tg_id: Number(tg_id||0), payload_json: payload||{} })
    }, 12000);
  }

  function estimates(action, body){
    var b = body || {}; b.action = action;
    return fetchJson(FN_ESTIMATES, {
      method:"POST", mode:"cors", headers: sbHeaders(),
      body: JSON.stringify(b)
    }, 14000);
  }

  function getProfile(tg_id){
    return fetchJson(FN_GET_PROFILE, {
      method:"POST", mode:"cors", headers: sbHeaders(),
      body: JSON.stringify({ tg_id: Number(tg_id||0) })
    }, 12000);
  }

  function reservePromo(){
    return fetchJson(FN_RESERVE_PROMO, {
      method:"POST", mode:"cors", headers: sbHeaders(), body: "{}"
    }, 12000);
  }

  function listCourierRequests(tg_id){
    var url = SUPABASE_REST_URL + "/courier_requests?tg_id=eq." + encodeURIComponent(String(tg_id||"")) +
      "&select=id,date,slot,address_json,items_json,status,cancel_reason,created_at,updated_at&order=created_at.desc";
    return fetchJson(url, {
      method:"GET",
      headers:{ "apikey": SUPABASE_ANON_KEY, "authorization":"Bearer " + SUPABASE_ANON_KEY, "accept":"application/json" }
    }, 12000);
  }

  window.API = {
    enqueueRequest: enqueueRequest,
    estimates: estimates,
    getProfile: getProfile,
    reservePromo: reservePromo,
    listCourierRequests: listCourierRequests,
    cfg: function(){ return { SUPABASE_REST_URL: SUPABASE_REST_URL, SUPABASE_ANON_KEY: SUPABASE_ANON_KEY, FN_ENQUEUE: FN_ENQUEUE }; }
  };
})();
