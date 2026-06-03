// ======================== 公开爬虫与公共模块 ========================
import fs from "fs";
// ======================== 随机延迟（反爬） ========================
export function randomDelay(min, max) {
  min = min || 500;
  max = max || 2000;
  return new Promise(function(r) { setTimeout(r, Math.floor(Math.random() * (max - min) + min)); });
}


export async function handlePopups(page) {
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const clicked = await page.evaluate(() => {
      let c = false;
      document.querySelectorAll(".btn_cancel, #C_no_btn, #no_btn, [class*='cancel']").forEach(btn => {
        if ((btn.textContent||"").trim().toUpperCase() === "NO") { btn.click(); c = true; }
      });
      document.querySelectorAll("[class*='msg_popup'] .btn, .btn_confirm, #C_ok_btn, #ok_btn, [class*='confirm']").forEach(btn => {
        if ((btn.textContent||"").trim().toUpperCase() === "OK") { btn.click(); c = true; }
      });
      return c;
    });
    if (!clicked) break;
  }
}

export async function clickTab(page, tabName, waitMs) {
  await randomDelay(300, 1200);
  waitMs = waitMs || 4000;
  try {
    const result = await page.evaluate((name) => {
      var uname = name.toUpperCase();
      var sels = ["div[id=\"tab_cn\"]","div[role=\"tab\"]","span[class*=\"tab\"]","a[class*=\"tab\"]","li[class*=\"nav\"]","span[class*=\"nav\"]","div[class*=\"tab\"]","div[class*=\"nav\"]","button[class*=\"tab\"]","div[id*=\"tab\"]","div.btn_filter"];
      for (var si = 0; si < sels.length; si++) {
        var els = document.querySelectorAll(sels[si]);
        for (var ei = 0; ei < els.length; ei++) {
          var t = (els[ei].textContent||"").trim().toUpperCase();
          if (t === uname || t.replace(/\s/g,"") === uname.replace(/\s/g,"")) {
            els[ei].scrollIntoView({block:"center"}); els[ei].click(); return {s:1,t:t};
          }
        }
      }
      var all = document.querySelectorAll("a,button,span,div,li");
      for (var i = 0; i < all.length; i++) {
        var t = (all[i].textContent||"").trim().toUpperCase();
        if (t !== uname) continue;
        var r = all[i].getBoundingClientRect();
        if (r.width < 10 || r.height < 8) continue;
        all[i].scrollIntoView({block:"center"}); all[i].click(); return {s:2,t:t};
      }
      for (var i = 0; i < all.length; i++) {
        var t = (all[i].textContent||"").trim().toUpperCase();
        var r = all[i].getBoundingClientRect();
        if (r.width < 15 || r.height < 10) continue;
        if (t.includes(uname)) { all[i].scrollIntoView({block:"center"}); all[i].click(); return {s:3,t:t}; }
      }
      return null;
    }, tabName);
    if (result) { await new Promise(r => setTimeout(r, waitMs)); return true; }
    return false;
  } catch (e) { return false; }
}

export function createCornerExtractorFn() {
  return "function extractCornerCount(r){var t=[];r.querySelectorAll('span.game_total,[class*=\"corner\"],[class*=\"total\"]').forEach(function(e){var n=parseInt((e.textContent||'').trim(),10);if(!isNaN(n)&&n>=0&&n<=30)t.push(n)});if(t.length)return t[0];var a=(r.textContent||'');var m=a.match(/角球[：:]\\s*(\\d{1,2})/);if(m)return parseInt(m[1],10);m=a.match(/corners?[：:]\\s*(\\d{1,2})/i);if(m)return parseInt(m[1],10);return 0}";
}

export async function parseAllMarkets(page) {
  var extractorFn = createCornerExtractorFn();
  var rawData = await page.evaluate(function(fn) {
    eval(fn);
    var results = [];
    function st(el,sel){var f=sel?el.querySelector(sel):el;return f?(f.textContent||'').trim():'';}
    var containers = document.querySelectorAll('div.box_lebet[class*="bet_type_"]');
    if(!containers.length) containers = document.querySelectorAll('div.bet_box');
    for(var bi=0; bi<containers.length; bi++){
      try{
        var box = containers[bi];
        var league=''; var prev=box.previousElementSibling;
        while(prev&&!league){var pt=(prev.textContent||'').trim();if(pt&&pt.length<40&&pt.indexOf('\n')<0&&!/^\d/.test(pt))league=pt;prev=prev.previousElementSibling;}
        var ht=st(box,'div.box_team.teamH span.text_team')||st(box,'div.team_home')||st(box,'[class*=\"team_h\"]');
        var at=st(box,'div.box_team.teamC span.text_team')||st(box,'div.team_away')||st(box,'[class*=\"team_a\"]');
        if((!ht||!at)&&box.closest){var pr=box.closest('[class*=\"row\"],[class*=\"game\"],[class*=\"match\"]');if(pr){ht=st(pr,'[class*=\"team_h\"] span,.teamH span');at=st(pr,'[class*=\"team_c\"] span,.teamC span');}}
        if(!ht||!at)continue;
        var sr=box.closest?box.closest('[class*=\"row\"],[class*=\"game\"],[class*=\"match\"],[class*=\"box_lebet\"]'):box.parentElement;if(!sr)sr=box;
        var ts=st(sr,'tt.text_time i,.text_time,[class*=\"timer\"],[class*=\"minute\"]');var em=0;
        if(ts){if(ts.toUpperCase()==='HT')em=45;else{var p=ts.split(':');em=p.length===2?(parseInt(p[0],10)||0):(parseInt(ts,10)||0);}}
        var hs=0,as2=0;var se=sr.querySelectorAll('div.box_score span.text_point,.score,[class*=\"score\"] span,[class*=\"point\"]');
        if(se.length>=2){var hsv=parseInt((se[0].textContent||'0').trim(),10);var asv=parseInt((se[1].textContent||'0').trim(),10);if(!isNaN(hsv)&&!isNaN(asv)&&hsv>=0&&hsv<=15&&asv>=0&&asv<=15){hs=hsv;as2=asv;}}
        var tc=extractCornerCount(sr)||extractCornerCount(box)||0;
        var blocks=box.querySelectorAll('div.box_lebet_odd');
        var entry={homeTeam:ht,awayTeam:at,league:league,time:ts,elapsedMinutes:em,homeScore:hs,awayScore:as2,totalCorners:tc,handicaps:[]};
        var oi=1;
        var cm={'大/小':'O/U','大小':'O/U','O/U':'O/U','角球大/小':'O/U','角球大小':'O/U','Over/Under':'O/U','让球':'HDP','HDP':'HDP','角球让球':'HDP','Handicap':'HDP','独赢':'1X2','1X2':'1X2','角球独赢':'1X2','单/双':'O/E','单双':'O/E','O/E':'O/E','角球单/双':'O/E','角球单双':'O/E','Odd/Even':'O/E'};
        for(var bi2=0; bi2<blocks.length; bi2++){
          try{
            var bl=blocks[bi2];var hsp=bl.querySelector('div.head_lebet span');var htt=bl.querySelector('div.head_lebet tt');
            if(!hsp)continue;var ml=(hsp.textContent||'').trim();var ih=(htt&&(htt.textContent.indexOf('上半场')>=0||htt.textContent.indexOf('1st Half')>=0||htt.textContent.indexOf('First Half')>=0||htt.textContent.indexOf('1H')>=0))||bl.classList.contains('box_lebet_half');
            var cat=cm[ml];if(!cat)continue;
            var btns=bl.querySelectorAll('div.btn_lebet_odd:not(.lock)');if(!btns.length)continue;
            var cl=ih?('上半场 '+ml):ml;
            // 检查是否在 CORNERS 标签页上下文（父容器包含 cn 类或 tab_cn 处于激活态）
            var isCornerContext = (function() {
              var cnTab = document.getElementById('tab_cn');
              if (cnTab && (cnTab.classList.contains('active') || cnTab.classList.contains('on'))) return true;
              var p = box;
              while (p) {
                if (p.className && typeof p.className === 'string') {
                  if (p.className.indexOf('bet_type_cn') >= 0) return true;
                }
                p = p.parentElement;
                if (p === document.body) break;
              }
              return false;
            })();
            var mg = 'main';
            // CORNERS 标签页下所有盘口都视为角球盘口
            if (isCornerContext || ml.indexOf('\u89D2\u7403') >= 0 || cat === 'O/E') {
              mg = 'corner';
            } else if (cat === 'HDP' || cat === 'O/U') {
              mg = 'main';
            }
            var he = {order:oi++,category:cat,categoryLabel:cl,period:ih?'half':'full',source:'dom',marketGroup:mg};
            if(btns.length===3){
              var ods={};
              for(var bj=0;bj<btns.length;bj++){
                var bq=btns[bj].querySelector('tt.text_ballou');var blv=(bq?bq.textContent:'').trim();
                var bv=parseFloat((btns[bj].querySelector('span.text_odds')||{}).textContent||'0');
                if(!isNaN(bv)&&bv>0){if(blv==='主')ods.home=bv;else if(blv==='和')ods.draw=bv;else if(blv==='客')ods.away=bv;}
              }
              he.odds=ods;
            } else {
              if(cat==='O/U'){
                var ln=parseFloat((btns[0].querySelector('tt.text_ballhead')||{}).textContent||'0')||0;
                var over=0,under=0;
                for(var bj=0;bj<btns.length;bj++){
                  var bq=btns[bj].querySelector('tt.text_ballou');var blv=(bq?bq.textContent:'').trim();
                  var bv=parseFloat((btns[bj].querySelector('span.text_odds')||{}).textContent||'0');
                  if(!isNaN(bv)&&bv>0){if(blv==='大')over=bv;else if(blv==='小')under=bv;}
                }
                he.line=ln;he.odds={over:over,under:under};
              } else if(cat==='HDP'){
                var ln=((btns[0].querySelector('tt.text_ballhead')||{}).textContent||'').trim();
                var ho=parseFloat((btns[0].querySelector('span.text_odds')||{}).textContent||'0');
                var ao=parseFloat((btns[1].querySelector('span.text_odds')||{}).textContent||'0');
                he.line=ln;he.odds={home:ho||0,away:ao||0};
              } else if(cat==='O/E'){
                var oo=0,eo=0;
                for(var bj=0;bj<btns.length;bj++){
                  var bq=btns[bj].querySelector('tt.text_ballou');var blv=(bq?bq.textContent:'').trim();
                  var bv=parseFloat((btns[bj].querySelector('span.text_odds')||{}).textContent||'0');
                  if(!isNaN(bv)&&bv>0){if(blv==='单')oo=bv;else if(blv==='双')eo=bv;}
                }
                he.odds={odd:oo,even:eo};
              }
            }
            entry.handicaps.push(he);
          }catch(e){}
        }
        if(entry.handicaps.length>0)results.push(entry);
      }catch(e){}
    }
    return results;
  }, extractorFn);
  var seen=new Set();var deduped=[];
  for(var i=0;i<rawData.length;i++){var m=rawData[i];var k=(m.homeTeam+'|||'+m.awayTeam).toLowerCase();if(!seen.has(k)){seen.add(k);deduped.push(m);}}
  if(deduped.length>0){
    var s=deduped[0];
    for(var j=0;j<Math.min(s.handicaps.length,4);j++){var h=s.handicaps[j];}
  }
  return deduped;
}

export function parseAsianHandicap(line) {
  if (line == null || line === '') return 0;
  if (typeof line === 'number') return line;
  var s = String(line).trim();
  var sign = 1, rest = s;
  if (rest.charAt(0) === '-') { sign = -1; rest = rest.substring(1); }
  else if (rest.charAt(0) === '+') { rest = rest.substring(1); }
  if (rest.indexOf('/') >= 0) {
    var parts = rest.split('/');
    var vals = []; for (var i=0;i<parts.length;i++){ var v=parseFloat(parts[i]); if(!isNaN(v))vals.push(v); }
    if (vals.length === 2) return sign * ((vals[0] + vals[1]) / 2);
    if (vals.length === 1) return sign * vals[0];
    return 0;
  }
  var val = parseFloat(rest);
  return (isNaN(val)) ? 0 : sign * val;
}
