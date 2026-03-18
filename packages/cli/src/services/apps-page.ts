// packages/cli/src/services/apps-page.ts

/**
 * HTML template for the /apps page — App Build & Deploy.
 *
 * generateAppsPageHtml() — amber/dark theme, all CSS/JS inline.
 * generateAppDetailHtml() — individual app detail (preserved from previous implementation).
 */

export function generateAppsPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brewnet — App Deploy</title>
<link rel="icon" type="image/svg+xml" href="/icon.svg"/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg0:#070d1a;--bg1:#0c1525;--bg2:#111e33;--bg3:#162640;--bg4:#1c3052;
  --bdr:#1a2d47;--bdr2:#22385c;--bdr3:#2c4a70;
  --amber:#e8a849;--amber2:#f5c97e;--amber3:#b07a18;
  --teal:#3dd6c8;--teal2:#26a89c;
  --green:#3de89a;--red:#f04b5a;--blue:#5b8fff;--violet:#a78bfa;--oran:#fb923c;
  --txt:#d2dff5;--txt2:#7a93be;--txt3:#3a5070;
  --mono:'JetBrains Mono',monospace;--sans:'Outfit',sans-serif;
  --r:8px;--r2:12px;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg0);color:var(--txt);font-family:var(--sans);overflow:hidden;font-size:14px}
#shell{display:flex;height:100vh}
#main{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden}
#header{height:50px;background:var(--bg1);border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;padding:0 24px;flex-shrink:0}
#header .logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--txt)}
#header .logo-text{display:flex;flex-direction:column;line-height:1.25}
#header .logo-name{font-size:16px;font-weight:800;color:var(--amber)}
#header .logo-tag{font-size:9.5px;color:var(--txt3);font-weight:400}
#header .nav-links{display:flex;align-items:center;gap:10px}
#header .nav-link{font-size:12px;font-family:var(--mono);color:var(--txt2);text-decoration:none;padding:5px 12px;border-radius:6px;border:1px solid var(--bdr2);transition:all .14s}
#header .nav-link:hover{color:var(--txt);border-color:var(--bdr3);background:var(--bg3)}
#header .nav-link.active{color:var(--amber);border-color:rgba(232,168,73,.3);background:rgba(232,168,73,.06)}
#topbar{height:44px;background:var(--bg0);border-bottom:1px solid var(--bdr);display:flex;align-items:center;padding:0 24px;gap:10px;flex-shrink:0}
#content{flex:1;overflow-y:auto;padding:28px 30px}
.bc{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--txt2)}
.bc .sep{color:var(--txt3)}.bc .cur{color:var(--txt);font-weight:600}
.tbr{margin-left:auto;display:flex;align-items:center;gap:8px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 15px;border-radius:var(--r);font-family:var(--sans);font-size:13px;font-weight:500;cursor:pointer;border:none;transition:all .14s;white-space:nowrap;user-select:none;line-height:1}
.btn:active{transform:scale(.97)}
.bp{background:var(--amber);color:#000}.bp:hover{background:var(--amber2)}
.bg{background:transparent;color:var(--txt2);border:1px solid var(--bdr2)}.bg:hover{background:var(--bg3);color:var(--txt)}
.bt{background:rgba(61,214,200,.1);color:var(--teal);border:1px solid rgba(61,214,200,.22)}.bt:hover{background:rgba(61,214,200,.18)}
.br{background:rgba(240,75,90,.1);color:var(--red);border:1px solid rgba(240,75,90,.22)}.br:hover{background:rgba(240,75,90,.18)}
.bv{background:rgba(167,139,250,.1);color:var(--violet);border:1px solid rgba(167,139,250,.22)}.bv:hover{background:rgba(167,139,250,.18)}
.bgrn{background:rgba(61,232,154,.1);color:var(--green);border:1px solid rgba(61,232,154,.22)}.bgrn:hover{background:rgba(61,232,154,.18)}
.bsm{padding:6px 12px;font-size:12px}.bxs{padding:4px 10px;font-size:11.5px}
.bdg{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-family:var(--mono);font-weight:600;padding:3px 9px;border-radius:20px}
.b-run{background:rgba(61,232,154,.09);color:var(--green);border:1px solid rgba(61,232,154,.2)}
.b-stop{background:rgba(240,75,90,.09);color:var(--red);border:1px solid rgba(240,75,90,.2)}
.b-build{background:rgba(232,168,73,.09);color:var(--amber);border:1px solid rgba(232,168,73,.2)}
.b-idle{background:rgba(122,147,190,.07);color:var(--txt3);border:1px solid var(--bdr)}
.blink-dot{width:6px;height:6px;border-radius:50%;background:currentColor;animation:bpulse 1.2s infinite;display:inline-block}
@keyframes bpulse{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes mUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.fg{margin-bottom:16px}
.fl{display:block;font-size:11.5px;color:var(--txt2);font-weight:500;margin-bottom:7px;letter-spacing:.2px}
.fi{width:100%;background:var(--bg3);border:1px solid var(--bdr2);border-radius:var(--r);padding:9px 13px;font-family:var(--mono);font-size:13px;color:var(--txt);outline:none;transition:border-color .14s}
.fi:focus{border-color:var(--amber)}.fi::placeholder{color:var(--txt3)}
.fhint{font-size:11px;color:var(--txt3);font-family:var(--mono);margin-top:5px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.overlay{position:fixed;inset:0;background:rgba(4,8,18,.88);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;z-index:900;padding:16px;animation:fadeIn .15s ease}
.modal{background:var(--bg2);border:1px solid var(--bdr2);border-radius:14px;width:100%;box-shadow:0 30px 100px rgba(0,0,0,.65);animation:mUp .2s ease;max-height:90vh;display:flex;flex-direction:column}
.msm{max-width:460px}.mmd{max-width:580px}.mlg{max-width:720px}
.mh{display:flex;align-items:flex-start;justify-content:space-between;padding:22px 24px 0;flex-shrink:0}
.mt-m{font-size:15px;font-weight:700}.ms{font-size:12px;color:var(--txt2);margin-top:3px}
.mb-m{padding:20px 24px;overflow-y:auto;flex:1}
.mfoot{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 24px;border-top:1px solid var(--bdr);flex-shrink:0}
.xbtn{width:28px;height:28px;border-radius:6px;background:var(--bg3);border:none;color:var(--txt2);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .14s;flex-shrink:0}
.xbtn:hover{background:var(--bdr2);color:var(--txt)}
.tabs{display:flex;border-bottom:1px solid var(--bdr);margin-bottom:20px;gap:0}
.tab{padding:10px 17px;font-size:13px;cursor:pointer;color:var(--txt2);border-bottom:2px solid transparent;transition:all .14s;margin-bottom:-1px;font-weight:500;user-select:none}
.tab:hover{color:var(--txt)}.tab.active{color:var(--amber);border-bottom-color:var(--amber)}
.ebox{background:linear-gradient(135deg,rgba(232,168,73,.04),rgba(61,214,200,.03));border:1px solid rgba(232,168,73,.18);border-left:3px solid var(--amber);border-radius:var(--r);padding:14px 16px;margin-bottom:22px}
.ebox-title{font-size:13px;font-weight:700;color:var(--amber);display:flex;align-items:center;gap:8px;margin-bottom:6px}
.ebox-desc{font-size:12.5px;color:var(--txt2);line-height:1.65}
.ebox-tags{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px}
.etag{font-size:10.5px;font-family:var(--mono);background:var(--bg3);color:var(--txt3);padding:2px 8px;border-radius:4px}
.stats4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
.sbox{background:var(--bg2);border:1px solid var(--bdr);border-radius:var(--r2);padding:15px 17px}
.sk{font-size:10px;color:var(--txt3);text-transform:uppercase;letter-spacing:.8px;font-family:var(--mono);margin-bottom:6px}
.sv{font-size:22px;font-weight:700;font-family:var(--mono)}
.app-card{background:var(--bg2);border:1px solid var(--bdr);border-radius:var(--r2);margin-bottom:12px;overflow:hidden;transition:border-color .15s}
.app-card:hover{border-color:var(--bdr3)}
.app-card-top{display:flex;align-items:flex-start;gap:14px;padding:16px 18px 12px}
.app-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;font-family:var(--mono);font-weight:800;flex-shrink:0;margin-top:2px}
.app-meta{flex:1;min-width:0}
.app-name{font-size:14px;font-weight:700;color:var(--txt);margin-bottom:5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.app-info{display:flex;align-items:center;gap:14px;font-size:12px;color:var(--txt2);flex-wrap:wrap;margin-bottom:6px}
.app-info-item{display:flex;align-items:center;gap:4px;font-family:var(--mono);font-size:11.5px}.app-info-item a{color:var(--teal);text-decoration:none;transition:opacity .14s}.app-info-item a:hover{opacity:.8;text-decoration:underline}
.app-domain{margin-top:4px}
.domain-link{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-family:var(--mono);color:var(--teal);text-decoration:none;background:rgba(61,214,200,.07);border:1px solid rgba(61,214,200,.18);padding:3px 9px;border-radius:20px;transition:all .14s}
.domain-link:hover{background:rgba(61,214,200,.14);border-color:rgba(61,214,200,.3)}
.no-domain{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-family:var(--mono);color:var(--txt3);cursor:pointer;padding:3px 9px;border:1px dashed var(--bdr2);border-radius:20px;transition:all .14s}
.no-domain:hover{border-color:var(--amber);color:var(--amber)}
.app-actions{display:flex;align-items:center;gap:7px;padding:10px 18px 14px;background:rgba(0,0,0,.15);border-top:1px solid var(--bdr);flex-wrap:wrap}
.app-actions-r{margin-left:auto;display:flex;gap:7px}
.lang-chip{font-size:10.5px;font-family:var(--mono);font-weight:700;padding:2px 7px;border-radius:4px}
.lc-go{background:rgba(0,173,216,.12);color:#00add8}
.lc-python{background:rgba(55,118,171,.12);color:#3776ab}
.lc-node{background:rgba(104,160,99,.12);color:#68a063}
.lc-rust{background:rgba(222,165,132,.12);color:#dea584}
.lc-java{background:rgba(248,152,32,.12);color:#f89820}
.lc-kotlin{background:rgba(167,139,250,.12);color:#a78bfa}
.lc-react{background:rgba(91,211,255,.12);color:#5bd3ff}
.lgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:18px}
.lcard{background:var(--bg3);border:1.5px solid var(--bdr);border-radius:var(--r);padding:12px 6px;text-align:center;cursor:pointer;transition:all .14s;user-select:none}
.lcard:hover{border-color:var(--bdr3)}.lcard.sel{border-color:var(--amber);background:rgba(232,168,73,.08)}
.lem{font-size:20px;margin-bottom:4px}.lnm{font-size:11px;font-weight:700;font-family:var(--mono)}
.fwrow{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:18px}
.fchip{padding:5px 13px;border-radius:20px;border:1.5px solid var(--bdr2);font-size:12px;font-family:var(--mono);cursor:pointer;background:var(--bg3);color:var(--txt2);transition:all .14s;user-select:none}
.fchip:hover{border-color:var(--amber);color:var(--amber)}.fchip.sel{border-color:var(--amber);background:rgba(232,168,73,.09);color:var(--amber)}
.bp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:18px}
.bp-card{background:var(--bg3);border:1.5px solid var(--bdr);border-radius:var(--r);padding:13px;cursor:pointer;transition:all .14s;user-select:none}
.bp-card:hover{border-color:var(--bdr3)}.bp-card.sel{border-color:var(--amber);background:rgba(232,168,73,.08)}
.bp-head{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.bp-em{font-size:18px}.bp-nm{font-size:12.5px;font-weight:700;font-family:var(--mono)}
.bp-fw{font-size:11px;color:var(--amber);font-family:var(--mono);margin-bottom:3px}
.bp-desc{font-size:11px;color:var(--txt3)}
.alert{padding:11px 14px;border-radius:var(--r);font-size:12.5px;line-height:1.5;margin-bottom:14px}
.a-warn{background:rgba(232,168,73,.07);border:1px solid rgba(232,168,73,.2);color:var(--amber)}
.a-info{background:rgba(61,214,200,.06);border:1px solid rgba(61,214,200,.17);color:var(--teal)}
.a-err{background:rgba(240,75,90,.07);border:1px solid rgba(240,75,90,.2);color:var(--red)}
.a-ok{background:rgba(61,232,154,.07);border:1px solid rgba(61,232,154,.2);color:var(--green)}
.a-dim{background:rgba(255,255,255,.03);border:1px solid var(--bdr);color:var(--txt2)}
.cb{background:var(--bg0);border:1px solid var(--bdr);border-radius:var(--r);padding:12px 15px;font-family:var(--mono);font-size:12px;color:var(--txt2);line-height:1.8;position:relative;white-space:pre-wrap;word-break:break-all;margin-top:10px}
.cpb{position:absolute;top:8px;right:8px;background:var(--bg3);border:1px solid var(--bdr2);color:var(--txt2);font-size:11px;padding:3px 9px;border-radius:5px;cursor:pointer;font-family:var(--sans);transition:all .14s;border:none}
.cpb:hover{background:var(--bdr2);color:var(--txt)}
.ppl{display:flex;flex-direction:column;gap:8px}
.pst{display:flex;align-items:center;gap:11px;padding:10px 13px;border-radius:var(--r);background:var(--bg3);border:1px solid transparent;transition:all .3s}
.pst.done{border-color:rgba(61,232,154,.18)}.pst.active{border-color:rgba(232,168,73,.3);background:rgba(232,168,73,.05)}.pst.wait{opacity:.4}
.pnum{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:var(--mono);font-weight:700;flex-shrink:0}
.pnum.done{background:rgba(61,232,154,.18);color:var(--green)}.pnum.active{background:rgba(232,168,73,.18);color:var(--amber)}.pnum.wait{background:var(--bg0);color:var(--txt3)}
.spin-ic{animation:spin .8s linear infinite;display:inline-block}
.rtbl{width:100%;border-collapse:collapse;font-size:13px}
.rtbl th{font-size:10.5px;text-align:left;padding:8px 12px;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid var(--bdr);font-weight:600}
.rtbl td{padding:11px 12px;border-bottom:1px solid var(--bdr);vertical-align:middle}
.rtbl tr:last-child td{border-bottom:none}.rtbl tr:hover td{background:rgba(255,255,255,.018)}
.rtbl-wrap{background:var(--bg2);border:1px solid var(--bdr);border-radius:var(--r2);overflow:hidden}
.dns-row{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;background:var(--bg3);border-radius:var(--r);margin-bottom:7px}
.dns-key{font-size:11.5px;color:var(--txt2);font-family:var(--mono);font-weight:600}
.dns-val{font-size:12px;font-family:var(--mono);color:var(--teal);word-break:break-all;text-align:right;flex:1;margin-left:12px}
.ir{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg3);border-radius:var(--r);margin-bottom:7px}
.ik{font-size:11.5px;color:var(--txt2);font-weight:500}
.iv{font-size:12px;font-family:var(--mono);color:var(--teal)}
.sec-title{font-size:13.5px;font-weight:700;color:var(--txt);display:flex;align-items:center;gap:8px;margin-bottom:14px}
.nbadge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;background:var(--bg3);border:1px solid var(--bdr2);border-radius:10px;font-size:11px;font-family:var(--mono);color:var(--txt2);margin-left:6px}
#toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--bdr2);border-radius:var(--r);padding:10px 18px;font-size:13px;color:var(--txt);box-shadow:0 8px 32px rgba(0,0,0,.5);z-index:9999;display:none;align-items:center;gap:8px;animation:fadeIn .2s ease}
/* Card top border by status */
.app-card.card-running{border-top:2px solid rgba(61,232,154,.4)}
.app-card.card-building{border-top:2px solid rgba(232,168,73,.4)}
.app-card.card-stopped{border-top:2px solid rgba(58,80,112,.3);opacity:.85}
.app-card.card-stopped:hover{opacity:1}
/* Meta grid (4-column info row) */
.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px 8px;padding:10px 0;border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);margin:10px 0}
.meta-item{display:flex;flex-direction:column;gap:2px}
.meta-key{font-size:9px;color:var(--txt3);font-family:var(--mono);letter-spacing:.05em;text-transform:uppercase}
.meta-val{font-size:11px;color:var(--txt2);font-family:var(--mono)}
.meta-val a{color:var(--teal);text-decoration:none}.meta-val a:hover{text-decoration:underline}
/* Commit row */
.commit-row{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg3);border:1px solid var(--bdr);border-radius:8px;margin-bottom:12px}
.commit-hash{font-family:var(--mono);font-size:11px;color:var(--amber);cursor:pointer;white-space:nowrap}.commit-hash:hover{text-decoration:underline}
.commit-msg{font-size:11px;color:var(--txt2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.commit-time{font-size:10px;color:var(--txt3);font-family:var(--mono);white-space:nowrap}
.gitea-link{font-size:10px;color:var(--txt3);font-family:var(--mono);padding:2px 8px;border:1px solid var(--bdr);border-radius:4px;cursor:pointer;white-space:nowrap;text-decoration:none;transition:all .14s}
.gitea-link:hover{color:var(--txt);border-color:var(--bdr3)}
/* Health badges */
.health-badges{display:flex;gap:5px;justify-content:flex-end;margin-top:4px}
.hbadge{font-size:9px;font-family:var(--mono);padding:1px 6px;border-radius:4px}
.hbadge-ok{background:rgba(61,232,154,.08);color:var(--green);border:1px solid rgba(61,232,154,.2)}
.hbadge-fail{background:rgba(240,75,90,.08);color:var(--red);border:1px solid rgba(240,75,90,.2)}
/* Inline build progress */
.build-progress{background:rgba(232,168,73,.06);border:1px solid rgba(232,168,73,.2);border-radius:10px;padding:12px 14px;margin-bottom:12px}
.build-progress-header{font-size:10px;font-family:var(--mono);color:var(--amber);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
.build-steps{display:flex;flex-direction:column;gap:5px}
.build-step{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-family:var(--mono)}
.build-step-name{display:flex;align-items:center;gap:7px}
.build-step-time{color:var(--txt3)}
.build-step-name.bsok{color:var(--green)}.build-step-name.bsrun{color:var(--amber)}.build-step-name.bswait{color:var(--txt3)}
.build-spinner{width:12px;height:12px;border:1.5px solid var(--amber);border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0;display:inline-block}
.progress-bar-wrap{height:3px;background:var(--bg4);border-radius:2px;margin-top:10px;overflow:hidden}
.progress-bar-fill{height:100%;background:var(--amber);border-radius:2px}
/* Stopped meta */
.stopped-meta{padding:8px 10px;background:var(--bg3);border-radius:8px;font-size:11px;color:var(--txt3);font-family:var(--mono);margin-bottom:12px}
/* Accordion log panel */
.acc-panel{display:none;border-top:1px solid var(--bdr);background:var(--bg0);padding:0}
.acc-panel.open{display:block}
.acc-header{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:var(--bg3);border-bottom:1px solid var(--bdr)}
.acc-header span{font-size:11px;font-family:var(--mono);color:var(--txt3)}
.acc-log{height:220px;overflow-y:auto;padding:10px 14px;font-family:var(--mono);font-size:11px;color:var(--txt2);white-space:pre-wrap;line-height:1.7}
.acc-log .log-err{color:var(--red)}.acc-log .log-warn{color:var(--amber)}
.acc-tabs{display:flex;gap:0;border-bottom:1px solid var(--bdr);background:var(--bg2)}
.acc-tab{padding:8px 16px;font-size:11.5px;font-family:var(--mono);color:var(--txt3);cursor:pointer;border-bottom:2px solid transparent;transition:all .14s}
.acc-tab:hover{color:var(--txt2)}.acc-tab.active{color:var(--amber);border-bottom-color:var(--amber)}
.acc-body{padding:0}.acc-tp{display:none;padding:14px 16px}.acc-tp.active{display:block}
.acc-info-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--bdr);font-size:12px}
.acc-info-key{color:var(--txt3);font-family:var(--mono);min-width:100px}
.acc-info-val{color:var(--txt2);font-family:var(--mono);word-break:break-all}
.acc-info-val a{color:var(--teal);text-decoration:none}.acc-info-val a:hover{text-decoration:underline}
.acc-code{background:var(--bg0);border:1px solid var(--bdr);border-radius:var(--r);padding:8px 12px;font-family:var(--mono);font-size:11px;color:var(--txt2);white-space:pre-wrap;word-break:break-all;margin:6px 0;position:relative}
.acc-cpb{position:absolute;top:6px;right:6px;background:var(--bg3);border:1px solid var(--bdr2);color:var(--txt3);font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;border:none;font-family:var(--sans)}
.acc-cpb:hover{color:var(--txt);background:var(--bdr2)}
.acc-section{margin-bottom:14px}
.acc-section-title{font-size:10px;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
</style>
</head>
<body>
<div id="shell">
<div id="main">
  <div id="header">
    <a href="/" class="logo">
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="var(--amber)" stroke-linecap="round" stroke-linejoin="round"><path d="M8 26H32V34C32 36.8 29.8 39 27 39H13C10.2 39 8 36.8 8 34V26Z" stroke-width="3.2" fill="none"/><path d="M32 28.5C35.5 28.5 37 30.5 37 32.5C37 34.5 35.5 36.5 32 36.5" stroke-width="3.2" fill="none"/><circle cx="20" cy="30" r="1.8" fill="var(--amber)" stroke="none"/><path d="M16.5 20a5 5 0 0 1 7 0" stroke-width="3" fill="none"/><path d="M13.5 15.5a10 10 0 0 1 13 0" stroke-width="3" fill="none"/><path d="M10.5 11a15 15 0 0 1 19 0" stroke-width="3" fill="none"/></svg>
      <span class="logo-text"><span class="logo-name">Brewnet</span><span class="logo-tag">Your server on tap. Just brew it.</span></span>
    </a>
    <div class="nav-links">
      <a href="/" class="nav-link">Dashboard</a>
      <a href="/apps" class="nav-link active">Apps</a>
    </div>
  </div>
  <div id="topbar">
    <div class="bc">
      <a href="/" style="color:var(--txt2);text-decoration:none">Home</a>
      <span class="sep">/</span>
      <span class="cur">App Deploy</span>
    </div>
    <div class="tbr">
      <button class="btn bg bsm" onclick="refreshAll()">↻ Refresh</button>
      <button class="btn bp" onclick="openModal('modal-new-app')">＋ New App</button>
    </div>
  </div>

  <div id="content">
    <div class="ebox">
      <div class="ebox-title">🚀 App Deploy</div>
      <div class="ebox-desc">Gitea에 연결된 앱을 빌드하고 배포합니다. <strong>Build</strong>는 Docker 이미지 빌드만 수행하며, <strong>Deploy</strong>는 Traefik 라우팅 등록을 포함한 전체 배포를 실행합니다.</div>
      <div class="ebox-tags">
        <span class="etag">Build = Docker 이미지 빌드</span>
        <span class="etag">Deploy = Traefik 라우팅 포함 전체 배포</span>
        <span class="etag">Cloudflare Tunnel 자동 연결</span>
        <span class="etag">Gitea 전체 Repo 관리</span>
      </div>
    </div>

    <div class="stats4">
      <div class="sbox"><div class="sk">TOTAL APPS</div><div class="sv" style="color:var(--txt)" id="stat-total">—</div></div>
      <div class="sbox"><div class="sk">RUNNING</div><div class="sv" style="color:var(--green)" id="stat-run">—</div></div>
      <div class="sbox"><div class="sk">STOPPED</div><div class="sv" style="color:var(--red)" id="stat-stop">—</div></div>
      <div class="sbox"><div class="sk">BUILDING</div><div class="sv" style="color:var(--amber)" id="stat-build">—</div></div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div class="sec-title">🚀 배포 앱 <span class="nbadge" id="badge-apps">0</span></div>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="fi" style="width:auto;padding:5px 11px;font-size:12px" onchange="filterApps(this.value)">
          <option value="all">전체 상태</option>
          <option value="running">Running</option>
          <option value="stopped">Stopped</option>
          <option value="building">Building</option>
        </select>
      </div>
    </div>
    <div id="app-list"><div style="text-align:center;padding:40px;color:var(--txt3)">불러오는 중...</div></div>

    <div style="margin-top:30px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div class="sec-title">📦 Gitea Repositories <span class="nbadge" id="badge-repos">0</span></div>
        <a href="http://localhost/git" class="btn bg bsm" style="text-decoration:none;font-size:12px" target="_blank" rel="noopener">Git Server에서 관리 →</a>
      </div>
      <div class="rtbl-wrap">
        <table class="rtbl">
          <thead>
            <tr>
              <th>Repository</th><th>언어</th><th>App Deploy</th><th>접근</th><th>최근 업데이트</th><th>액션</th>
            </tr>
          </thead>
          <tbody id="repo-tbody"><tr><td colspan="6" style="text-align:center;padding:20px;color:var(--txt3)">불러오는 중...</td></tr></tbody>
        </table>
      </div>
    </div>
  </div>
</div>
</div>

<!-- MODAL: NEW APP -->
<div id="modal-new-app" class="overlay" style="display:none" onclick="closeOnOverlay(event,'modal-new-app')">
  <div class="modal mlg">
    <div class="mh">
      <div>
        <div class="mt-m">New App</div>
        <div class="ms">보일러플레이트, Git Clone, 또는 새 프로젝트를 Gitea에 자동 연결합니다</div>
      </div>
      <button class="xbtn" onclick="closeModal('modal-new-app')">✕</button>
    </div>
    <div class="mb-m">
      <div class="tabs" id="newapp-tabs">
        <div class="tab active" onclick="switchTab('newapp',0)">📦 보일러플레이트</div>
        <div class="tab" onclick="switchTab('newapp',1)">⬇ Git Clone</div>
        <div class="tab" onclick="switchTab('newapp',2)">✨ New Project</div>
      </div>
      <!-- TAB 0: BOILERPLATE -->
      <div id="newapp-tab-0">
        <div class="alert a-info" style="margin-bottom:16px">이미 설치된 보일러플레이트를 Gitea에 연결합니다. 새 프로젝트를 처음부터 생성하려면 <strong>New Project</strong> 탭을 사용하세요.</div>
        <div class="bp-grid" id="bp-grid"></div>
        <div class="row2">
          <div class="fg">
            <label class="fl">앱 이름 <span style="color:var(--red)">*</span></label>
            <input class="fi" id="bp-appname" placeholder="my-app" oninput="sanitizeAppName(this)">
            <div class="fhint">Gitea repo 이름으로 사용됩니다 (소문자·하이픈)</div>
          </div>
          <div class="fg">
            <label class="fl">포트 <span style="color:var(--red)">*</span></label>
            <input class="fi" id="bp-port" placeholder="8080" type="number" min="1024" max="65535" oninput="debouncedPortCheck('bp-port')">
            <div class="fhint" id="bp-port-hint"></div>
          </div>
        </div>
        <div id="bp-selected-info" style="display:none">
          <div class="ir"><span class="ik">선택된 템플릿</span><span class="iv" id="bp-sel-nm">—</span></div>
          <div class="ir"><span class="ik">Gitea 레포 경로</span><span class="iv" id="bp-sel-repo">—</span></div>
        </div>
      </div>
      <!-- TAB 1: GIT CLONE -->
      <div id="newapp-tab-1" style="display:none">
        <div class="alert a-dim" style="margin-bottom:16px">외부 Git URL(GitHub, GitLab 등)의 레포지토리를 클론한 뒤 로컬 Gitea에 자동으로 미러링합니다.</div>
        <div class="fg">
          <label class="fl">Git URL <span style="color:var(--red)">*</span></label>
          <input class="fi" id="clone-url" placeholder="https://github.com/user/repo.git" oninput="autoFillFromUrl(this.value)">
        </div>
        <div class="row3">
          <div class="fg">
            <label class="fl">앱 이름 <span style="color:var(--red)">*</span></label>
            <input class="fi" id="clone-name" placeholder="repo-name" oninput="sanitizeAppName(this)">
          </div>
          <div class="fg">
            <label class="fl">포트 <span style="color:var(--red)">*</span></label>
            <input class="fi" id="clone-port" placeholder="8080" type="number" oninput="debouncedPortCheck('clone-port')">
            <div class="fhint" id="clone-port-hint"></div>
          </div>
          <div class="fg">
            <label class="fl">브랜치</label>
            <input class="fi" id="clone-branch" placeholder="main">
          </div>
        </div>
      </div>
      <!-- TAB 2: NEW PROJECT -->
      <div id="newapp-tab-2" style="display:none">
        <label class="fl" style="margin-bottom:10px">언어 선택 <span style="color:var(--red)">*</span></label>
        <div class="lgrid" id="lang-grid"></div>
        <div id="fw-section" style="display:none">
          <label class="fl" style="margin-bottom:10px">프레임워크 <span style="color:var(--red)">*</span></label>
          <div class="fwrow" id="fw-row"></div>
        </div>
        <div class="row2">
          <div class="fg">
            <label class="fl">앱 이름 <span style="color:var(--red)">*</span></label>
            <input class="fi" id="proj-name" placeholder="my-app" oninput="sanitizeAppName(this)">
          </div>
          <div class="fg">
            <label class="fl">포트 <span style="color:var(--red)">*</span></label>
            <input class="fi" id="proj-port" placeholder="8080" type="number" oninput="debouncedPortCheck('proj-port')">
            <div class="fhint" id="proj-port-hint"></div>
          </div>
        </div>
        <div id="proj-preview" style="display:none">
          <div class="ir"><span class="ik">생성될 Gitea 레포</span><span class="iv" id="proj-repo-preview">—</span></div>
          <div class="ir"><span class="ik">Docker 포트 바인딩</span><span class="iv" id="proj-port-preview">—</span></div>
        </div>
      </div>
    </div>
    <div class="mfoot">
      <button class="btn bg" onclick="closeModal('modal-new-app')">취소</button>
      <button class="btn bp" id="newapp-submit" onclick="submitNewApp()">🚀 앱 생성 및 Gitea 푸시</button>
    </div>
  </div>
</div>

<!-- MODAL: DOMAIN SETUP -->
<div id="modal-domain" class="overlay" style="display:none" onclick="closeOnOverlay(event,'modal-domain')">
  <div class="modal mlg">
    <div class="mh">
      <div>
        <div class="mt-m">🌐 도메인 연결 — <span id="domain-app-name" style="color:var(--amber)">—</span></div>
        <div class="ms">외부 도메인을 앱에 연결합니다</div>
      </div>
      <button class="xbtn" onclick="closeModal('modal-domain')">✕</button>
    </div>
    <div class="mb-m">
      <div class="tabs" id="domain-tabs">
        <div class="tab active" onclick="switchTab('domain',0)">☁ 새 Cloudflare 도메인</div>
        <div class="tab" onclick="switchTab('domain',1)">🔗 기존 도메인 연결</div>
        <div class="tab" onclick="switchTab('domain',2)">🔀 서브도메인 추가</div>
      </div>
      <!-- TAB 0: CLOUDFLARE AUTO -->
      <div id="domain-tab-0">
        <div id="cf-creds-status" class="alert a-info" style="margin-bottom:16px">Cloudflare API를 통해 Tunnel ingress rule과 DNS CNAME 레코드를 자동으로 생성합니다.</div>
        <div class="row2">
          <div class="fg">
            <label class="fl">도메인 <span style="color:var(--red)">*</span></label>
            <input class="fi" id="cf-domain" placeholder="example.com" oninput="updateCfPreview()">
          </div>
          <div class="fg">
            <label class="fl">서브도메인 (선택)</label>
            <input class="fi" id="cf-sub" placeholder="myapp" oninput="updateCfPreview()">
            <div class="fhint">결과: <span id="cf-preview" style="color:var(--teal);font-family:var(--mono)">myapp.example.com</span></div>
          </div>
        </div>
      </div>
      <!-- TAB 1: EXISTING DOMAIN (MANUAL) -->
      <div id="domain-tab-1" style="display:none">
        <div class="alert a-warn" style="margin-bottom:16px">이미 도메인이 있는 경우, 아래 가이드에 따라 DNS를 수동으로 설정하세요.</div>
        <div class="fg">
          <label class="fl">연결할 서브도메인 <span style="color:var(--red)">*</span></label>
          <input class="fi" id="ext-sub" placeholder="myapp.yourdomain.com" oninput="updateExtPreview()">
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--txt);margin-bottom:10px">DNS 설정 방법</div>
        <div class="dns-row"><span class="dns-key">Type</span><span class="dns-val">CNAME</span></div>
        <div class="dns-row"><span class="dns-key">Name</span><span class="dns-val" id="ext-dns-name">myapp</span></div>
        <div class="dns-row" style="margin-bottom:14px">
          <span class="dns-key">Target</span>
          <span class="dns-val" style="display:flex;align-items:center;gap:8px">
            <span id="ext-dns-target">tunnel-id.cfargotunnel.com</span>
            <button class="cpb" onclick="copyText('ext-dns-target','복사됨!')">복사</button>
          </span>
        </div>
        <div class="alert a-info">Cloudflare를 사용 중이라면 Proxy 상태를 🟠 Proxied로 설정하세요.</div>
      </div>
      <!-- TAB 2: SUBDOMAIN ONLY -->
      <div id="domain-tab-2" style="display:none">
        <div class="alert a-info" style="margin-bottom:16px">이미 Cloudflare Tunnel이 루트 도메인에 연결되어 있다면, 서브도메인만 추가 등록할 수 있습니다.</div>
        <div class="fg">
          <label class="fl">베이스 도메인 <span style="color:var(--red)">*</span></label>
          <select class="fi" id="sub-base"><option value="">— 연결된 도메인 선택 —</option></select>
        </div>
        <div class="fg">
          <label class="fl">서브도메인 프리픽스 <span style="color:var(--red)">*</span></label>
          <div style="display:flex;align-items:center;gap:0">
            <input class="fi" id="sub-prefix" placeholder="myapp" oninput="updateSubPreview()" style="border-radius:var(--r) 0 0 var(--r);border-right:none">
            <div style="background:var(--bg0);border:1px solid var(--bdr2);border-radius:0 var(--r) var(--r) 0;padding:9px 12px;font-family:var(--mono);font-size:13px;color:var(--txt3);white-space:nowrap" id="sub-base-display">.example.com</div>
          </div>
          <div class="fhint">최종 도메인: <span id="sub-preview" style="color:var(--teal);font-family:var(--mono)">myapp.example.com</span></div>
        </div>
      </div>
    </div>
    <div class="mfoot">
      <button class="btn bg" onclick="closeModal('modal-domain')">취소</button>
      <button class="btn bp" onclick="submitDomain()">연결 적용</button>
    </div>
  </div>
</div>

<!-- MODAL: DELETE CONFIRM -->
<div id="modal-delete" class="overlay" style="display:none" onclick="closeOnOverlay(event,'modal-delete')">
  <div class="modal msm">
    <div class="mh">
      <div>
        <div class="mt-m" style="color:var(--red)">⚠ 앱 삭제</div>
        <div class="ms">이 작업은 되돌릴 수 없습니다</div>
      </div>
      <button class="xbtn" onclick="closeModal('modal-delete')">✕</button>
    </div>
    <div class="mb-m">
      <div id="delete-warn-running" class="alert a-err" style="display:none;margin-bottom:14px">
        🔴 이 앱은 현재 <strong>실행 중</strong>입니다. 삭제하려면 먼저 Stop 버튼을 눌러 앱을 중지한 후 삭제하세요.
      </div>
      <div id="delete-warn-normal" class="alert a-warn" style="margin-bottom:14px">
        <strong id="delete-app-name">앱 이름</strong> 을 삭제하면 Gitea 레포지토리와 빌드 이미지가 함께 제거됩니다.
      </div>
      <div class="fg">
        <label class="fl">확인을 위해 앱 이름을 입력하세요</label>
        <input class="fi" id="delete-confirm-input" placeholder="앱 이름 입력" oninput="checkDeleteConfirm()">
      </div>
    </div>
    <div class="mfoot">
      <button class="btn bg" onclick="closeModal('modal-delete')">취소</button>
      <button class="btn br" id="delete-submit-btn" disabled onclick="confirmDelete()">삭제 확인</button>
    </div>
  </div>
</div>

<!-- MODAL: BUILD / DEPLOY PROGRESS -->
<div id="modal-progress" class="overlay" style="display:none">
  <div class="modal mmd">
    <div class="mh">
      <div>
        <div class="mt-m" id="progress-title">진행 중...</div>
        <div class="ms" id="progress-subtitle"></div>
      </div>
    </div>
    <div class="mb-m">
      <div class="ppl" id="progress-steps"></div>
      <div id="progress-log" style="display:none;margin-top:16px">
        <div style="font-size:11.5px;color:var(--txt3);font-family:var(--mono);margin-bottom:6px">로그</div>
        <div style="background:var(--bg0);border:1px solid var(--bdr);border-radius:var(--r);padding:12px 14px;font-family:var(--mono);font-size:11.5px;color:var(--txt2);line-height:1.8;height:130px;overflow-y:auto" id="log-content"></div>
      </div>
    </div>
    <div class="mfoot">
      <button class="btn bg" id="progress-close-btn" style="display:none" onclick="closeProgressModal()">닫기</button>
    </div>
  </div>
</div>

<!-- TOAST -->
<div id="toast"></div>

<script>
/* ─── STATE ─── */
var apps = [];
var repos = [];
var domains = [];
var domainTunnel = null;
var domainCredentialsConfigured = false;
var appGitInfo = {};
var filterState = 'all';
var selectedBp = null;
var selectedLang = null;
var selectedFw = null;
var currentNewAppTab = 0;
var currentDomainTab = 0;
var domainTargetName = null;
var deleteTargetName = null;
var activeJobId = null;
var jobPollTimer = null;
var sseSource = null;
var portCheckTimers = {};
var connectInputShown = {};
var installedBp = [];

/* ─── STATIC DATA ─── */
var BOILERPLATES = [
  {id:'go-gin',            lang:'Go',      fw:'Gin',                  desc:'REST API + PostgreSQL',    emoji:'🐹', port:8080},
  {id:'go-echo',           lang:'Go',      fw:'Echo v4',              desc:'Web server + Redis',       emoji:'🐹', port:8081},
  {id:'go-fiber',          lang:'Go',      fw:'Fiber v3',             desc:'High-perf REST API',       emoji:'🐹', port:8082},
  {id:'python-fastapi',    lang:'Python',  fw:'FastAPI',              desc:'Async API + SQLAlchemy',   emoji:'🐍', port:8000},
  {id:'python-django',     lang:'Python',  fw:'Django',               desc:'Full-stack + ORM',         emoji:'🐍', port:8001},
  {id:'python-flask',      lang:'Python',  fw:'Flask',                desc:'Lightweight REST API',     emoji:'🐍', port:5000},
  {id:'nodejs-express',    lang:'Node.js', fw:'Express',              desc:'Minimal REST API',         emoji:'🟨', port:3001},
  {id:'nodejs-nestjs',     lang:'Node.js', fw:'NestJS',               desc:'TypeScript + Prisma',      emoji:'🟨', port:3000},
  {id:'nodejs-nextjs',     lang:'Node.js', fw:'Next.js (API)',        desc:'API Routes only',          emoji:'🟨', port:3000},
  {id:'nodejs-nextjs-full',lang:'React',   fw:'Next.js (Full-Stack)', desc:'Full-stack App Router',    emoji:'⚛️', port:3000},
  {id:'rust-actix-web',    lang:'Rust',    fw:'Actix-web',            desc:'High-perf REST API',       emoji:'🦀', port:8888},
  {id:'rust-axum',         lang:'Rust',    fw:'Axum',                 desc:'Async REST API + SQLx',    emoji:'🦀', port:8080},
  {id:'java-springboot',   lang:'Java',    fw:'Spring Boot',          desc:'Enterprise REST + JPA',    emoji:'☕', port:8080},
  {id:'java-spring',       lang:'Java',    fw:'Spring Framework',     desc:'JDBC + HikariCP',          emoji:'☕', port:8080},
  {id:'kotlin-ktor',       lang:'Kotlin',  fw:'Ktor',                 desc:'Lightweight web server',   emoji:'🟣', port:8082},
  {id:'kotlin-springboot', lang:'Kotlin',  fw:'Spring Boot (Kotlin)', desc:'JDBC + HikariCP',          emoji:'🟣', port:8080},
];
var LANG_DATA = {
  'Go':     {emoji:'🐹', fw:['Gin','Echo v4','Fiber v3']},
  'Python': {emoji:'🐍', fw:['FastAPI','Django','Flask']},
  'Node.js':{emoji:'🟨', fw:['Express','NestJS']},
  'Rust':   {emoji:'🦀', fw:['Actix-web','Axum']},
  'Java':   {emoji:'☕', fw:['Spring Boot','Spring Framework']},
  'Kotlin': {emoji:'🟣', fw:['Ktor','Spring Boot (Kotlin)']},
  'React':  {emoji:'⚛️', fw:['Next.js']},
};
var LANG_COLOR = {
  'Go':'lc-go','Python':'lc-python','Node.js':'lc-node','JavaScript':'lc-node',
  'TypeScript':'lc-node','Rust':'lc-rust','Java':'lc-java','Kotlin':'lc-kotlin',
  'React':'lc-react','Shell':'lc-rust','YAML':'lc-python'
};
var LANG_ICON_BG = {
  'Go':'rgba(0,173,216,.15)','Python':'rgba(55,118,171,.15)','Node.js':'rgba(104,160,99,.15)',
  'JavaScript':'rgba(104,160,99,.15)','Rust':'rgba(222,165,132,.15)','Java':'rgba(248,152,32,.15)',
  'Kotlin':'rgba(167,139,250,.15)','React':'rgba(91,211,255,.15)'
};

/* ─── HTML ESCAPE ─── */
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ─── TIME AGO ─── */
function timeAgo(iso){
  if(!iso)return '—';
  var diff=Date.now()-new Date(iso).getTime();
  var m=Math.floor(diff/60000);
  if(m<1)return 'just now';
  if(m<60)return m+'m ago';
  var h=Math.floor(m/60);
  if(h<24)return h+'h ago';
  return Math.floor(h/24)+'d ago';
}

/* ─── STATUS HELPERS ─── */
function uiStatus(app){return app.status==='creating'?'building':app.status;}
function langClass(lang){return LANG_COLOR[lang]||'lc-node';}
function iconBg(lang){return LANG_ICON_BG[lang]||'rgba(122,147,190,.12)';}

/* ─── API HELPERS ─── */
async function apiFetch(url,opts){
  try{
    var r=await fetch(url,opts);
    var d=await r.json();
    if(!r.ok){showToast('\u26a0 BN'+String(r.status)+': '+(d.error||d.message||'API error'));}
    return {ok:r.ok,status:r.status,data:d};
  }catch(e){showToast('\u26a0 네트워크 오류: '+e.message);return {ok:false,data:{}};}
}

/* ─── LOAD DATA ─── */
async function loadApps(){
  var r=await apiFetch('/api/apps');
  apps=Array.isArray(r.data)?r.data:(r.data.apps||[]);
}
async function loadRepos(){
  var r=await apiFetch('/api/git/repos');
  repos=Array.isArray(r.data)?r.data:(r.data.repos||[]);
}
async function loadInstalledBp(){
  var r=await apiFetch('/api/apps/boilerplates');
  installedBp=Array.isArray(r.data)?r.data:(r.data.boilerplates||[]);
}
async function loadDomains(){
  var r=await apiFetch('/api/domain/list');
  // API returns { connections: DomainConnection[], tunnel, credentialsConfigured }
  domains=Array.isArray(r.data)?r.data:(r.data.connections||[]);
  domainTunnel=r.data.tunnel||null;
  domainCredentialsConfigured=!!r.data.credentialsConfigured;
}
async function loadGitInfo(){
  var results=await Promise.all(apps.map(function(a){
    return fetch('/api/apps/'+encodeURIComponent(a.name)+'/git')
      .then(function(r){return r.json();})
      .then(function(d){return {name:a.name,git:d.git||null};})
      .catch(function(){return {name:a.name,git:null};});
  }));
  appGitInfo={};
  results.forEach(function(r){appGitInfo[r.name]=r.git;});
}

async function refreshAll(){
  // Load apps + domains + installed boilerplates first (fast: file read + local state)
  // Do NOT await repos here — Gitea may be unreachable and would block forever
  await Promise.all([loadApps(),loadDomains().catch(function(){}),loadInstalledBp().catch(function(){})]);
  await loadGitInfo();
  renderApps();renderBpGrid();
  showToast('\u21bb \uc0c8\ub85c\uace0\uce68 \uc644\ub8cc');
  // Load repos in background — render when ready, never blocks app list
  loadRepos().catch(function(){}).then(function(){renderRepos();});
}

/* ─── STATS ─── */
function updateStats(){
  document.getElementById('stat-total').textContent=apps.length;
  document.getElementById('stat-run').textContent=apps.filter(function(a){return uiStatus(a)==='running';}).length;
  document.getElementById('stat-stop').textContent=apps.filter(function(a){return uiStatus(a)==='stopped'||uiStatus(a)==='failed';}).length;
  document.getElementById('stat-build').textContent=apps.filter(function(a){return uiStatus(a)==='building';}).length;
}

/* ─── FILTER ─── */
function filterApps(val){filterState=val;renderApps();}

/* ─── RENDER APPS ─── */
function renderApps(){
  var list=document.getElementById('app-list');
  document.getElementById('badge-apps').textContent=apps.length;
  updateStats();
  var filtered=filterState==='all'?apps:apps.filter(function(a){return uiStatus(a)===filterState;});
  if(apps.length===0){
    list.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--txt3)"><div style="font-size:32px;margin-bottom:10px">📭</div><div style="font-size:13px">아직 등록된 앱이 없습니다. New App을 눌러 시작하세요.</div></div>';
    return;
  }
  if(filtered.length===0){
    list.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--txt3)"><div style="font-size:32px;margin-bottom:10px">📭</div><div style="font-size:13px">해당 상태의 앱이 없습니다</div></div>';
    return;
  }
  list.innerHTML=filtered.map(function(app){
    var st=uiStatus(app);
    var isBuilding=st==='building';
    var isRunning=st==='running';
    var isStopped=st==='stopped'||st==='failed';
    var statusBadge=isRunning
      ?'<span class="bdg b-run"><span class="blink-dot"></span> Running</span>'
      :isBuilding
      ?'<span class="bdg b-build"><span class="spin-ic">⟳</span> Building</span>'
      :'<span class="bdg b-stop">Stopped</span>';
    var domain=domains.find(function(d){return d.appName===app.name;});
    var git=appGitInfo[app.name];
    var repoPath=app.giteaRepoUrl?app.giteaRepoUrl.replace(new RegExp('^https?://[^/]+/'),''):'';
    var gitInternalPath=app.giteaRepoUrl?app.giteaRepoUrl.replace(new RegExp('^https?://[^/]+'),''):'';
    var commitInfo=git&&git.latestCommit?git.latestCommit:null;
    var lc=langClass(app.lang||'');
    var appInit=(app.name||'??').slice(0,2).toUpperCase();
    var ic=iconBg(app.lang||'');
    var disAttr=isBuilding?' disabled style="opacity:.4;cursor:not-allowed"':'';

    // Domain area (top right)
    var domainHtml='';
    if(domain){
      domainHtml='<div class="app-domain"><a class="domain-link" href="https://'+escH(domain.hostname||domain.domain)+'" target="_blank" rel="noopener">'+escH(domain.hostname||domain.domain)+' ↗</a>'
        +'<div class="health-badges"><span class="hbadge hbadge-ok">DNS ✓</span><span class="hbadge hbadge-ok">Tunnel ✓</span><span class="hbadge hbadge-ok">HTTPS ✓</span></div></div>';
    }else{
      domainHtml='<div class="app-domain"><span class="no-domain" onclick="openDomainModal(&#39;'+escH(app.name)+'&#39;)">+ 도메인 연결</span></div>';
    }

    // Card header
    var headHtml='<div class="card-head" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'
      +'<div style="display:flex;gap:12px;align-items:flex-start">'
      +'<div class="app-icon" style="background:'+ic+'">'+appInit+'</div>'
      +'<div><div class="app-name" style="font-size:14px;font-weight:700;margin-bottom:5px">'+escH(app.name)+'</div>'
      +'<div style="display:flex;gap:5px;flex-wrap:wrap">'+statusBadge
      +(app.lang?' <span class="lang-chip '+lc+'">'+escH(app.lang)+'</span>':'')
      +(app.framework?' <span class="lang-chip" style="background:var(--bg3);color:var(--txt2);border:1px solid var(--bdr)">'+escH(app.framework)+'</span>':'')
      +'</div></div></div>'
      +domainHtml+'</div>';

    // Meta grid
    var portLink=isRunning
      ?'<a href="http://localhost:'+app.port+'" target="_blank" rel="noopener" style="color:var(--teal);text-decoration:none">:'+app.port+'</a>'
      :':'+app.port;
    var branchName=git&&git.branch?git.branch:'main';
    var metaHtml='<div class="meta-grid">'
      +'<div class="meta-item"><span class="meta-key">Port</span><span class="meta-val">'+portLink+'</span></div>'
      +'<div class="meta-item"><span class="meta-key">Uptime</span><span class="meta-val">'+(isRunning?timeAgo(app.createdAt):'—')+'</span></div>'
      +'<div class="meta-item"><span class="meta-key">Branch</span><span class="meta-val">'+escH(branchName)+'</span></div>'
      +'<div class="meta-item"><span class="meta-key">Last deploy</span><span class="meta-val">'+(commitInfo?timeAgo(commitInfo.date):'—')+'</span></div>'
      +'</div>';

    // Commit row
    var commitHtml='';
    if(commitInfo){
      var commitLink=gitInternalPath?'/api/gitea/autologin?redirect='+encodeURIComponent(gitInternalPath+'/commit/'+commitInfo.hash):'#';
      var giteaLinkHtml=gitInternalPath?'<a class="gitea-link" href="/api/gitea/autologin?redirect='+encodeURIComponent(gitInternalPath)+'" target="_blank" rel="noopener">Gitea ↗</a>':'';
      commitHtml='<div class="commit-row"'+(isStopped?' style="opacity:.6"':'')+'>'
        +'<a class="commit-hash" href="'+commitLink+'" target="_blank" rel="noopener">'+escH(commitInfo.shortHash)+'</a>'
        +'<span class="commit-msg">'+escH(commitInfo.message.slice(0,40))+'</span>'
        +'<span class="commit-time">'+timeAgo(commitInfo.date)+'</span>'
        +giteaLinkHtml
        +'</div>';
    }

    // Action row
    var startStopBtn=isBuilding
      ?''
      :isRunning
      ?'<button class="btn bg bxs" onclick="toggleApp(&#39;'+escH(app.name)+'&#39;,&#39;stop&#39;)">■ Stop</button>'
      :'<button class="btn bgrn bxs" onclick="toggleApp(&#39;'+escH(app.name)+'&#39;,&#39;start&#39;)">▶ Start</button>';
    var actionHtml='<div class="app-actions" style="display:flex;gap:7px;flex-wrap:wrap">'
      +startStopBtn
      +(isBuilding?'':'<button class="btn bt bxs" onclick="runDeploy(&#39;'+escH(app.name)+'&#39;)"'+disAttr+'>🚀 Deploy</button>')
      +'<button class="btn bg bxs" onclick="toggleDetailPanel(&#39;'+escH(app.name)+'&#39;);switchAccTab(&#39;'+escH(app.name)+'&#39;,&#39;logs&#39;)">📋 Logs</button>'
      +(isBuilding?'<button class="btn br bxs" onclick="toggleApp(&#39;'+escH(app.name)+'&#39;,&#39;stop&#39;)">✕ Cancel</button>':'')
      +(!isBuilding?'<button class="btn bg bxs" onclick="openDomainModal(&#39;'+escH(app.name)+'&#39;)">🌐 도메인</button>':'')
      +(!isBuilding
        ?(isBuilding
          ?'<button class="btn br bxs" disabled style="opacity:.4;cursor:not-allowed" title="빌드 중에는 삭제 불가">🗑</button>'
          :'<button class="btn br bxs" onclick="openDeleteModal(&#39;'+escH(app.name)+'&#39;)">🗑</button>')
        :'')
      +'</div>';

    // Building: inline progress
    var buildHtml='';
    if(isBuilding){
      buildHtml='<div class="build-progress" id="bp-'+escH(app.name)+'">'
        +'<div class="build-progress-header"><span>Build Progress</span><span id="bp-pct-'+escH(app.name)+'">—</span></div>'
        +'<div class="build-steps" id="bp-steps-'+escH(app.name)+'"><div class="build-step"><div class="build-step-name bsrun"><div class="build-spinner"></div> 빌드 진행 중...</div></div></div>'
        +'<div class="progress-bar-wrap"><div class="progress-bar-fill" id="bp-bar-'+escH(app.name)+'" style="width:10%"></div></div>'
        +'</div>';
    }

    // Stopped: compact meta
    var stoppedHtml='';
    if(isStopped){
      stoppedHtml='<div class="stopped-meta">마지막 실행: '+timeAgo(app.createdAt)+' · Port :'+app.port+' · Branch: '+escH(branchName)+'</div>';
    }

    // Accordion detail panel (5 tabs: Overview | Git | Deploy | Logs | Domain)
    var EN=escH(app.name);
    var accHtml='<div class="acc-panel" id="acc-'+EN+'">'
      +'<div class="acc-header"><span>'+EN+'</span>'
      +'<button class="btn bg bxs" onclick="toggleDetailPanel(&#39;'+EN+'&#39;)" style="font-size:10px">Close ✕</button></div>'
      +'<div class="acc-tabs">'
      +'<span class="acc-tab active" onclick="switchAccTab(&#39;'+EN+'&#39;,&#39;ov&#39;)">Overview</span>'
      +'<span class="acc-tab" onclick="switchAccTab(&#39;'+EN+'&#39;,&#39;git&#39;)">Git</span>'
      +'<span class="acc-tab" onclick="switchAccTab(&#39;'+EN+'&#39;,&#39;deploy&#39;)">Deploy</span>'
      +'<span class="acc-tab" onclick="switchAccTab(&#39;'+EN+'&#39;,&#39;logs&#39;)">Logs</span>'
      +'<span class="acc-tab" onclick="switchAccTab(&#39;'+EN+'&#39;,&#39;domain&#39;)">Domain</span>'
      +'</div>'
      +'<div class="acc-body" id="accbody-'+EN+'">'
      +'<div class="acc-tp active" id="accp-'+EN+'-ov"><div style="color:var(--txt3);font-size:12px">Loading...</div></div>'
      +'<div class="acc-tp" id="accp-'+EN+'-git"><div style="color:var(--txt3);font-size:12px">Loading...</div></div>'
      +'<div class="acc-tp" id="accp-'+EN+'-deploy"><div style="color:var(--txt3);font-size:12px">Loading...</div></div>'
      +'<div class="acc-tp" id="accp-'+EN+'-logs"><div class="acc-log" id="acclog-'+EN+'"></div></div>'
      +'<div class="acc-tp" id="accp-'+EN+'-domain"><div style="color:var(--txt3);font-size:12px">Loading...</div></div>'
      +'</div></div>';

    // Assemble card
    var cardClass='app-card'+(isRunning?' card-running':isBuilding?' card-building':' card-stopped');
    return '<div class="'+cardClass+'" id="appcard-'+escH(app.name)+'">'
      +headHtml
      +(isBuilding?buildHtml:(isStopped?stoppedHtml:metaHtml))
      +commitHtml
      +actionHtml
      +accHtml
      +'</div>';
  }).join('');
}

/* ─── RENDER REPOS ─── */
function renderRepos(){
  var tbody=document.getElementById('repo-tbody');
  document.getElementById('badge-repos').textContent=repos.length;
  if(!repos.length){tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--txt3)">Gitea 레포지토리가 없습니다</td></tr>';return;}
  tbody.innerHTML=repos.map(function(r){
    var lc=LANG_COLOR[r.language]||'lc-node';
    var connectedApp=r.appName?apps.find(function(a){return a.name===r.appName;}):null;
    var deployBadge=connectedApp
      ?('<span class="bdg b-run" style="font-size:10px">✔ '+escH(connectedApp.name)+'</span>')
      :'<span class="bdg b-idle" style="font-size:10px">미연결</span>';
    var actionCell;
    if(connectInputShown[r.name]){
      actionCell='<div style="display:flex;gap:6px;align-items:center">'
        +'<input class="fi" id="ci-'+escH(r.name)+'" placeholder="앱 이름" style="width:120px;padding:5px 9px;font-size:12px">'
        +'<button class="btn bt bxs" onclick="doConnectRepo(&#39;'+escH(r.name)+'&#39;)">연결</button>'
        +'<button class="btn bg bxs" onclick="cancelConnect(&#39;'+escH(r.name)+'&#39;)">취소</button>'
        +'</div>';
    }else if(connectedApp){
      actionCell='<button class="btn bg bxs" onclick="scrollToApp(&#39;'+escH(connectedApp.name)+'&#39;)">앱 보기 →</button>';
    }else{
      actionCell='<button class="btn bt bxs" onclick="showConnectInput(&#39;'+escH(r.name)+'&#39;)">+ 연결</button>';
    }
    var updated=r.updatedAt?timeAgo(r.updatedAt):'—';
    var gitAutoUrl='/api/gitea/autologin?redirect='+encodeURIComponent('/git/admin/'+r.name);
    return '<tr>'
      +'<td><div style="display:flex;align-items:center;gap:8px">'
      +'<span style="font-size:13px;font-weight:600;font-family:var(--mono)">'+escH(r.name)+'</span>'
      +(r.private?'<span style="font-size:10px;background:var(--bg3);color:var(--txt3);border:1px solid var(--bdr);padding:1px 6px;border-radius:4px;font-family:var(--mono)">private</span>':'')
      +'<span style="font-size:10.5px;color:var(--txt3)">⭐ '+(r.stars||0)+'</span>'
      +'</div></td>'
      +'<td>'+( r.language?('<span class="lang-chip '+lc+'">'+escH(r.language)+'</span>'):'—')+'</td>'
      +'<td>'+deployBadge+'</td>'
      +'<td><a href="'+gitAutoUrl+'" target="_blank" rel="noopener" style="font-size:11.5px;font-family:var(--mono);color:var(--teal);text-decoration:none">git.local/admin/'+escH(r.name)+' ↗</a></td>'
      +'<td style="font-size:12px;color:var(--txt3);font-family:var(--mono)">'+updated+'</td>'
      +'<td>'+actionCell+'</td>'
      +'</tr>';
  }).join('');
}

/* ─── CONNECT REPO HELPERS ─── */
function showConnectInput(repoName){connectInputShown[repoName]=true;renderRepos();var inp=document.getElementById('ci-'+repoName);if(inp)inp.value=repoName;}
function cancelConnect(repoName){delete connectInputShown[repoName];renderRepos();}
async function doConnectRepo(repoName){
  var inp=document.getElementById('ci-'+repoName);
  if(!inp)return;
  var appName=inp.value.trim();
  if(!appName){showToast('\u26a0 앱 이름을 입력하세요');return;}
  var r=await apiFetch('/api/git/repos/'+encodeURIComponent(repoName)+'/connect',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({appName:appName})
  });
  if(r.ok){
    delete connectInputShown[repoName];
    showToast('\u2705 '+repoName+' \u2192 '+appName+' \uc5f0\uacb0 \uc644\ub8cc');
    await refreshAll();
  }
}

/* ─── TOGGLE APP ─── */
async function toggleApp(name,action){
  var r=await apiFetch('/api/apps/'+encodeURIComponent(name)+'/'+action,{method:'POST'});
  if(r.ok){
    showToast((action==='start'?'\u25b6 ':'\u25a0 ')+name+' '+(action==='start'?'\uc2dc\uc791':'\uc911\uc9c0')+'\ub428');
    await loadApps();renderApps();
  }
}

/* ─── BUILD & DEPLOY ─── */
async function runBuild(name){
  var r=await apiFetch('/api/apps/'+encodeURIComponent(name)+'/deploy',{method:'POST'});
  if(!r.ok)return;
  var jobId=r.data.jobId;
  openProgressModal('\uc774\ubbf8\uc9c0 \ube4c\ub4dc \uc911...',name,4);
  startJobPoll(jobId,name,4);
}
async function runDeploy(name){
  var r=await apiFetch('/api/apps/'+encodeURIComponent(name)+'/deploy',{method:'POST'});
  if(!r.ok)return;
  var jobId=r.data.jobId;
  openProgressModal('\uc804\uccb4 \ubc30\ud3ec \uc911...',name,6);
  startJobPoll(jobId,name,6);
  startSseLogs(name);
}

/* ─── PROGRESS MODAL ─── */
function openProgressModal(title,appName,maxSteps){
  document.getElementById('progress-title').textContent=title;
  document.getElementById('progress-subtitle').textContent=appName;
  document.getElementById('progress-steps').innerHTML='';
  document.getElementById('progress-log').style.display='none';
  document.getElementById('progress-close-btn').style.display='none';
  document.getElementById('log-content').textContent='';
  openModal('modal-progress');
}

function renderProgressSteps(steps,maxSteps){
  var show=steps.slice(0,maxSteps);
  document.getElementById('progress-steps').innerHTML=show.map(function(s,i){
    var cls=s.status==='done'?'done':s.status==='running'?'active':'wait';
    var numCls=cls;
    var numHtml=s.status==='done'?'\u2713':s.status==='running'?'<span class="spin-ic">\u27f3</span>':String(i+1);
    return '<div class="pst '+cls+'">'
      +'<div class="pnum '+numCls+'">'+numHtml+'</div>'
      +'<div><div style="font-size:12.5px;font-weight:600">'+escH(s.label)+'</div>'
      +(s.message?'<div style="font-size:11px;color:var(--txt3)">'+escH(s.message)+'</div>':'')
      +'</div></div>';
  }).join('');
}

function startJobPoll(jobId,appName,maxSteps){
  if(jobPollTimer)clearInterval(jobPollTimer);
  activeJobId=jobId;
  jobPollTimer=setInterval(async function(){
    var r=await fetch('/api/apps/jobs/'+encodeURIComponent(jobId)).then(function(x){return x.json();}).catch(function(){return null;});
    if(!r)return;
    if(r.steps)renderProgressSteps(r.steps,maxSteps);
    if(r.status==='running'){
      document.getElementById('progress-log').style.display='block';
    }
    if(r.status==='done'||r.status==='failed'){
      clearInterval(jobPollTimer);jobPollTimer=null;activeJobId=null;
      if(sseSource){sseSource.close();sseSource=null;}
      document.getElementById('progress-close-btn').style.display='flex';
      if(r.status==='done'){
        showToast('\u2705 '+appName+' \uc644\ub8cc');
        // Auto-enable deploy settings (autoDeploy: true, branch: main)
        fetch('/api/apps/'+encodeURIComponent(appName)+'/deploy/settings',{
          method:'PUT',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({autoDeploy:true,deployBranch:'main'})
        }).catch(function(){});
      }else{
        showToast('\u274c '+appName+' \uc2e4\ud328: '+(r.error||''));
        document.getElementById('progress-log').style.display='block';
        var logEl=document.getElementById('log-content');
        logEl.textContent='\u274c Error: '+(r.error||'Unknown error');
        var failedStep=r.steps?r.steps.find(function(s){return s.status==='failed';}):null;
        if(failedStep){logEl.textContent+='\\nFailed at: '+failedStep.label+(failedStep.message?' ('+failedStep.message+')':'');}
      }
      await loadApps();await loadRepos();renderApps();renderRepos();
    }
  },1500);
}

function startSseLogs(appName){
  if(sseSource)sseSource.close();
  var logEl=document.getElementById('log-content');
  sseSource=new EventSource('/api/apps/'+encodeURIComponent(appName)+'/logs');
  sseSource.onmessage=function(e){
    try{var d=JSON.parse(e.data);logEl.textContent+=(d.line||e.data)+'\\n';}
    catch(_){logEl.textContent+=e.data+'\\n';}
    logEl.scrollTop=logEl.scrollHeight;
    document.getElementById('progress-log').style.display='block';
  };
  sseSource.onerror=function(){if(sseSource){sseSource.close();sseSource=null;}};
}

function closeProgressModal(){
  if(jobPollTimer){clearInterval(jobPollTimer);jobPollTimer=null;}
  if(sseSource){sseSource.close();sseSource=null;}
  closeModal('modal-progress');
}

/* ─── ACCORDION DETAIL PANEL (5 tabs) ─── */
var accSseSources={};
var accLoaded={};
function toggleDetailPanel(appName){
  var panel=document.getElementById('acc-'+appName);
  if(!panel)return;
  var isOpen=panel.classList.contains('open');
  if(isOpen){
    panel.classList.remove('open');
    if(accSseSources[appName]){accSseSources[appName].close();delete accSseSources[appName];}
  }else{
    panel.classList.add('open');
    if(!accLoaded[appName])loadAccOverview(appName);
    accLoaded[appName]=true;
  }
}
function switchAccTab(appName,tab){
  var tabs=document.getElementById('acc-'+appName).querySelectorAll('.acc-tab');
  tabs.forEach(function(t,i){t.className='acc-tab'+((['ov','git','deploy','logs','domain'][i]===tab)?' active':'');});
  ['ov','git','deploy','logs','domain'].forEach(function(t){
    var p=document.getElementById('accp-'+appName+'-'+t);
    if(p)p.className='acc-tp'+(t===tab?' active':'');
  });
  if(tab==='ov')loadAccOverview(appName);
  if(tab==='git')loadAccGit(appName);
  if(tab==='deploy')loadAccDeploy(appName);
  if(tab==='logs')startAccLogs(appName);
  if(tab==='domain')loadAccDomain(appName);
}
function loadAccOverview(appName){
  fetch('/api/apps/'+encodeURIComponent(appName)).then(function(r){return r.json();}).then(function(d){
    if(!d||!d.app)return;var a=d.app;
    var el=document.getElementById('accp-'+appName+'-ov');
    var lu=a.port?'http://localhost:'+a.port:'';
    el.innerHTML='<div class="acc-section">'
      +'<div class="acc-info-row"><span class="acc-info-key">Name</span><span class="acc-info-val">'+escH(a.name)+'</span></div>'
      +'<div class="acc-info-row"><span class="acc-info-key">Mode</span><span class="acc-info-val">'+escH(a.mode||'—')+'</span></div>'
      +'<div class="acc-info-row"><span class="acc-info-key">Stack</span><span class="acc-info-val">'+escH(a.stackId||a.sourceUrl||'—')+'</span></div>'
      +'<div class="acc-info-row"><span class="acc-info-key">Port</span><span class="acc-info-val">'+(lu?'<a href="'+lu+'" target="_blank">'+lu+'</a>':a.port||'—')+'</span></div>'
      +'<div class="acc-info-row"><span class="acc-info-key">Status</span><span class="acc-info-val">'+escH(a.status)+'</span></div>'
      +'<div class="acc-info-row"><span class="acc-info-key">Created</span><span class="acc-info-val">'+escH((a.createdAt||'').replace('T',' ').slice(0,16))+'</span></div>'
      +'</div>';
  }).catch(function(){});
}
function loadAccGit(appName){
  fetch('/api/apps/'+encodeURIComponent(appName)+'/git').then(function(r){return r.json();}).then(function(d){
    if(!d||!d.git)return;var g=d.git;
    var el=document.getElementById('accp-'+appName+'-git');
    var c=g.latestCommit;
    el.innerHTML='<div class="acc-section"><div class="acc-section-title">Repository</div>'
      +'<div class="acc-info-row"><span class="acc-info-key">Gitea</span><span class="acc-info-val"><a href="/api/gitea/autologin?redirect='+encodeURIComponent('/git/admin/'+appName)+'" target="_blank">'+escH(g.giteaUrl)+' ↗</a></span></div>'
      +'<div class="acc-info-row"><span class="acc-info-key">Branch</span><span class="acc-info-val">'+escH(g.branch||'main')+'</span></div>'
      +'<div class="acc-info-row"><span class="acc-info-key">Commit</span><span class="acc-info-val">'+(c?escH(c.shortHash+' — '+c.message):'(empty)')+'</span></div>'
      +'</div>'
      +'<div class="acc-section"><div class="acc-section-title">Clone</div>'
      +'<div class="acc-code">'+escH(g.cloneUrlHttp)+'</div>'
      +'<div class="acc-code">'+escH(g.cloneUrlSsh)+'</div>'
      +'</div>';
  }).catch(function(){});
}
function loadAccDeploy(appName){
  var el=document.getElementById('accp-'+appName+'-deploy');
  fetch('/api/apps/'+encodeURIComponent(appName)+'/deploy/settings').then(function(r){return r.json();}).then(function(s){
    el.innerHTML='<div class="acc-section"><div class="acc-section-title">Deploy Settings</div>'
      +'<div class="acc-info-row"><span class="acc-info-key">Auto Deploy</span><span class="acc-info-val"><label style="cursor:pointer"><input type="checkbox" id="acc-ad-'+appName+'" '+(s.autoDeploy?'checked':'')+' onchange="saveAccDeploy(&#39;'+appName+'&#39;)"> On push</label></span></div>'
      +'<div class="acc-info-row"><span class="acc-info-key">Branch</span><span class="acc-info-val"><input id="acc-br-'+appName+'" value="'+escH(s.deployBranch||'main')+'" style="background:var(--bg0);border:1px solid var(--bdr);border-radius:4px;color:var(--txt2);padding:3px 8px;font-family:var(--mono);font-size:11px;width:100px" onchange="saveAccDeploy(&#39;'+appName+'&#39;)"></span></div>'
      +'</div>'
      +'<button class="btn bt bxs" onclick="triggerAccDeploy(&#39;'+appName+'&#39;)">🚀 Deploy Now</button>'
      +' <span id="acc-dm-'+appName+'" style="font-size:11px;color:var(--txt3)"></span>'
      +'<div id="acc-dh-'+appName+'" style="margin-top:12px"></div>';
    loadAccHistory(appName);
  }).catch(function(){});
}
function saveAccDeploy(appName){
  var ad=document.getElementById('acc-ad-'+appName);
  var br=document.getElementById('acc-br-'+appName);
  fetch('/api/apps/'+encodeURIComponent(appName)+'/deploy/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({autoDeploy:ad?ad.checked:false,deployBranch:br?br.value:'main'})}).catch(function(){});
}
function triggerAccDeploy(appName){
  var msg=document.getElementById('acc-dm-'+appName);
  if(msg)msg.textContent='Deploying...';
  fetch('/api/apps/'+encodeURIComponent(appName)+'/deploy',{method:'POST'}).then(function(r){return r.json();}).then(function(d){
    if(d.error){if(msg)msg.textContent='Error: '+d.error;return;}
    if(msg)msg.textContent='Job '+d.jobId;
    openProgressModal('Deploy '+appName,appName,3);
    startJobPoll(d.jobId,appName,3);
  }).catch(function(e){if(msg)msg.textContent='Error';});
}
function loadAccHistory(appName){
  fetch('/api/deploy/history?app='+encodeURIComponent(appName)).then(function(r){return r.json();}).then(function(d){
    var el=document.getElementById('acc-dh-'+appName);if(!el)return;
    var entries=(d.history||[]).slice().reverse().slice(0,5);
    if(!entries.length){el.innerHTML='<div style="font-size:11px;color:var(--txt3)">No deployments yet.</div>';return;}
    el.innerHTML='<div class="acc-section-title">History (last 5)</div>'+entries.map(function(e){
      var icon=e.status==='success'?'<span style="color:var(--green)">✓</span>':'<span style="color:var(--red)">✗</span>';
      return '<div style="font-size:11px;font-family:var(--mono);padding:3px 0;color:var(--txt2)">'+icon+' '+escH((e.commitHash||'').slice(0,7))+' '+escH(e.commitMessage||'')+' <span style="color:var(--txt3)">'+escH((e.deployedAt||'').replace('T',' ').slice(0,16))+'</span></div>';
    }).join('');
  }).catch(function(){});
}
function startAccLogs(appName){
  if(accSseSources[appName])return;
  var logEl=document.getElementById('acclog-'+appName);
  if(!logEl)return;
  logEl.innerHTML='<span style="color:var(--txt3)">Connecting...</span>';
  var src=new EventSource('/api/apps/'+encodeURIComponent(appName)+'/logs');
  src.onmessage=function(e){
    if(logEl.querySelector('span'))logEl.innerHTML='';
    var div=document.createElement('div');
    var cls=new RegExp('error|fatal','i').test(e.data)?'log-err':new RegExp('warn','i').test(e.data)?'log-warn':'';
    if(cls)div.className=cls;
    div.textContent=e.data;logEl.appendChild(div);
    if(logEl.children.length>300)logEl.removeChild(logEl.firstChild);
    logEl.scrollTop=logEl.scrollHeight;
  };
  src.onerror=function(){
    var d=document.createElement('div');d.textContent='[stream ended]';d.style.color='var(--txt3)';logEl.appendChild(d);
    delete accSseSources[appName];
  };
  accSseSources[appName]=src;
}
function loadAccDomain(appName){
  var el=document.getElementById('accp-'+appName+'-domain');
  el.innerHTML='<div style="color:var(--txt3);font-size:12px">도메인 연결은 상단 🌐 도메인 버튼을 사용하세요.</div>'
    +'<div style="margin-top:10px"><button class="btn bt bxs" onclick="openDomainModal(&#39;'+appName+'&#39;)">🌐 도메인 연결</button></div>';
}
function scrollToApp(appName){
  var card=document.getElementById('appcard-'+appName);
  if(!card)return;
  card.scrollIntoView({behavior:'smooth',block:'center'});
  card.style.boxShadow='0 0 0 2px var(--amber)';
  setTimeout(function(){card.style.boxShadow='';},2000);
  var panel=document.getElementById('acc-'+appName);
  if(panel&&!panel.classList.contains('open'))toggleDetailPanel(appName);
}

/* ─── MODALS ─── */
function openModal(id){document.getElementById(id).style.display='flex';}
function closeModal(id){document.getElementById(id).style.display='none';}
function closeOnOverlay(e,id){if(e.target===document.getElementById(id))closeModal(id);}

/* ─── NEW APP MODAL ─── */
function switchTab(group,idx){
  var tabs=document.getElementById(group+'-tabs').querySelectorAll('.tab');
  tabs.forEach(function(t,i){t.classList.toggle('active',i===idx);});
  if(group==='newapp'){
    [0,1,2].forEach(function(i){document.getElementById('newapp-tab-'+i).style.display=i===idx?'block':'none';});
    currentNewAppTab=idx;
  }else if(group==='domain'){
    [0,1,2].forEach(function(i){document.getElementById('domain-tab-'+i).style.display=i===idx?'block':'none';});
    currentDomainTab=idx;
  }
}

/* ─── BOILERPLATE GRID ─── */
function renderBpGrid(){
  // Filter to only show installed boilerplates (from /api/apps/boilerplates)
  var installedIds=installedBp.map(function(b){return b.stackId;});
  var available=BOILERPLATES.filter(function(bp){return installedIds.indexOf(bp.id)>=0;});
  if(available.length===0){
    document.getElementById('bp-grid').innerHTML='<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--txt3);font-size:13px">설치된 보일러플레이트가 없습니다. <strong>New Project</strong> 탭에서 새 프로젝트를 생성하세요.</div>';
    return;
  }
  document.getElementById('bp-grid').innerHTML=available.map(function(bp){
    return '<div class="bp-card" id="bpc-'+bp.id+'" onclick="selectBp(&#39;'+bp.id+'&#39;)"><div class="bp-head"><span class="bp-em">'+bp.emoji+'</span><span class="bp-nm">'+escH(bp.lang)+'</span></div><div class="bp-fw">'+escH(bp.fw)+'</div><div class="bp-desc">'+escH(bp.desc)+'</div></div>';
  }).join('');
}

function selectBp(id){
  document.querySelectorAll('.bp-card').forEach(function(c){c.classList.remove('sel');});
  document.getElementById('bpc-'+id).classList.add('sel');
  selectedBp=BOILERPLATES.find(function(b){return b.id===id;});
  document.getElementById('bp-port').value=selectedBp.port;
  document.getElementById('bp-sel-nm').textContent=selectedBp.lang+' \u00b7 '+selectedBp.fw;
  var nm=document.getElementById('bp-appname').value||'my-app';
  document.getElementById('bp-sel-repo').textContent='git.local/admin/'+nm;
  document.getElementById('bp-selected-info').style.display='block';
  debouncedPortCheck('bp-port');
}

/* ─── LANG GRID ─── */
function renderLangGrid(){
  document.getElementById('lang-grid').innerHTML=Object.keys(LANG_DATA).map(function(l){
    var key=l.replace(/[^a-z0-9]/gi,'');
    return '<div class="lcard" onclick="selectLang(&#39;'+escH(l)+'&#39;)" id="lc-'+key+'"><div class="lem">'+LANG_DATA[l].emoji+'</div><div class="lnm">'+escH(l)+'</div></div>';
  }).join('');
}

function selectLang(lang){
  document.querySelectorAll('.lcard').forEach(function(c){c.classList.remove('sel');});
  var key=lang.replace(/[^a-z0-9]/gi,'');
  var el=document.getElementById('lc-'+key);
  if(el)el.classList.add('sel');
  selectedLang=lang;selectedFw=null;
  var fw=LANG_DATA[lang]?LANG_DATA[lang].fw:[];
  document.getElementById('fw-section').style.display=fw.length?'block':'none';
  document.getElementById('fw-row').innerHTML=fw.map(function(f){
    return '<div class="fchip" onclick="selectFw(this,&#39;'+escH(f)+'&#39;)">'+escH(f)+'</div>';
  }).join('');
  updateProjPreview();
}

function selectFw(el,fw){
  document.querySelectorAll('.fchip').forEach(function(c){c.classList.remove('sel');});
  el.classList.add('sel');selectedFw=fw;updateProjPreview();
}

function updateProjPreview(){
  var nm=document.getElementById('proj-name').value;
  var port=document.getElementById('proj-port').value;
  if(nm){
    document.getElementById('proj-repo-preview').textContent='git.local/admin/'+nm;
    document.getElementById('proj-port-preview').textContent='0.0.0.0:'+(port||'?')+'->PORT/tcp';
    document.getElementById('proj-preview').style.display='block';
  }
}

/* ─── AUTO-FILL FROM URL ─── */
function autoFillFromUrl(url){
  var match=url.match(new RegExp('/([^/]+?)(\\.git)?$'));
  if(match)document.getElementById('clone-name').value=match[1].toLowerCase().replace(/[^a-z0-9-]/g,'-');
}

/* ─── SANITIZE APP NAME ─── */
function sanitizeAppName(el){
  el.value=el.value.toLowerCase().replace(/[^a-z0-9-]/g,'-');
  if(el.id==='bp-appname'&&selectedBp){
    document.getElementById('bp-sel-repo').textContent='git.local/admin/'+(el.value||'my-app');
  }
  if(el.id==='proj-name')updateProjPreview();
}

/* ─── PORT CONFLICT CHECK ─── */
function debouncedPortCheck(inputId){
  if(portCheckTimers[inputId])clearTimeout(portCheckTimers[inputId]);
  portCheckTimers[inputId]=setTimeout(function(){checkPortConflict(inputId);},600);
}
async function checkPortConflict(inputId){
  var el=document.getElementById(inputId);
  var hintId=inputId.replace('-port','-port-hint');
  if(inputId==='bp-port')hintId='bp-port-hint';
  else if(inputId==='clone-port')hintId='clone-port-hint';
  else if(inputId==='proj-port')hintId='proj-port-hint';
  var hintEl=document.getElementById(hintId);
  if(!el||!hintEl)return;
  var port=parseInt(el.value);
  if(!port||port<1024||port>65535){hintEl.textContent='';return;}
  var r=await fetch('/api/apps/check-port?port='+port).then(function(x){return x.json();}).catch(function(){return null;});
  if(!r){hintEl.textContent='';return;}
  if(!r.available){
    hintEl.style.color='var(--red)';
    hintEl.textContent='\u26a0 포트 '+port+' 사용 중';
    // Find next available port suggestion
    for(var p=port+1;p<=port+10;p++){
      var r2=await fetch('/api/apps/check-port?port='+p).then(function(x){return x.json();}).catch(function(){return null;});
      if(r2&&r2.available){
        var suggested=p;
        hintEl.innerHTML='\u26a0 포트 '+port+' \uc0ac\uc6a9 \uc911 — <button onclick="usePort(&#39;'+inputId+'&#39;,'+suggested+')" style="background:none;border:none;color:var(--amber);cursor:pointer;font-family:var(--mono);font-size:11px;padding:0;text-decoration:underline">'+suggested+' \uc0ac\uc6a9</button> \ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?';
        break;
      }
    }
  }else{
    hintEl.style.color='var(--green)';hintEl.textContent='\u2713 \uc0ac\uc6a9 \uac00\ub2a5\ud55c \ud3ec\ud2b8';
  }
}
function usePort(inputId,port){
  var el=document.getElementById(inputId);
  if(el){el.value=port;debouncedPortCheck(inputId);}
}

/* ─── SUBMIT NEW APP ─── */
async function submitNewApp(){
  var name='',port='',body={};
  if(currentNewAppTab===0){
    name=document.getElementById('bp-appname').value;
    port=document.getElementById('bp-port').value;
    if(!selectedBp||!name||!port){showToast('\u26a0 \ud544\uc218 \ud56d\ubaa9\uc744 \ubaa8\ub450 \uc785\ub825\ud558\uc138\uc694');return;}
    body={mode:'boilerplate',appName:name,port:parseInt(port),stackId:selectedBp.id};
  }else if(currentNewAppTab===1){
    name=document.getElementById('clone-name').value;
    port=document.getElementById('clone-port').value;
    var gitUrl=document.getElementById('clone-url').value;
    if(!gitUrl||!name||!port){showToast('\u26a0 \ud544\uc218 \ud56d\ubaa9\uc744 \ubaa8\ub450 \uc785\ub825\ud558\uc138\uc694');return;}
    var branch=document.getElementById('clone-branch').value.trim();
    body={mode:'git-url',appName:name,port:parseInt(port),gitUrl:gitUrl};
    if(branch)body.branch=branch;
  }else{
    name=document.getElementById('proj-name').value;
    port=document.getElementById('proj-port').value;
    if(!selectedLang||!name||!port){showToast('\u26a0 \ud544\uc218 \ud56d\ubaa9\uc744 \ubaa8\ub450 \uc785\ub825\ud558\uc138\uc694');return;}
    var LANG_CODE_MAP={'Go':'go','Python':'python','Node.js':'nodejs','Rust':'rust','Java':'java','Kotlin':'kotlin','React':'nodejs'};
    var FW_CODE_MAP={'Gin':'gin','Echo v4':'echo','Fiber v3':'fiber','FastAPI':'fastapi','Django':'django','Flask':'flask','Express':'express','NestJS':'nestjs','Actix-web':'actix-web','Axum':'axum','Spring Boot':'springboot','Spring Framework':'spring','Ktor':'ktor','Spring Boot (Kotlin)':'springboot-kt','Next.js':'nextjs'};
    body={mode:'new-project',appName:name,port:parseInt(port),language:LANG_CODE_MAP[selectedLang]||selectedLang.toLowerCase()};
    if(selectedFw)body.frameworkId=FW_CODE_MAP[selectedFw]||selectedFw.toLowerCase().replace(/[^a-z0-9-]/g,'-');
  }
  document.getElementById('newapp-submit').disabled=true;
  var r=await apiFetch('/api/apps/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  document.getElementById('newapp-submit').disabled=false;
  if(!r.ok)return;
  var jobId=r.data.jobId;
  closeModal('modal-new-app');
  openProgressModal('\uc571 \uc0dd\uc131 \uc911...',name,6);
  startJobPoll(jobId,name,6);
  startSseLogs(name);
  showToast('\ud83d\ude80 '+name+' \uc0dd\uc131 \uc2dc\uc791\ub428 (Job: '+jobId+')');
}

/* ─── DOMAIN MODAL ─── */
function openDomainModal(name){
  domainTargetName=name;
  document.getElementById('domain-app-name').textContent=name;
  // Populate sub-base dropdown with unique base domains from existing connections
  var sel=document.getElementById('sub-base');
  var uniqueBases=[...new Set(domains.map(function(d){return d.domain;}))].filter(Boolean);
  sel.innerHTML='<option value="">— 연결된 도메인 선택 —</option>'+
    uniqueBases.map(function(d){return '<option value="'+escH(d)+'">'+escH(d)+'</option>';}).join('');
  updateSubPreview();
  // Show CF credentials status in tab 0
  var cfAlert=document.getElementById('cf-creds-status');
  if(cfAlert){
    if(domainCredentialsConfigured){
      cfAlert.className='alert a-ok';cfAlert.textContent='✅ Cloudflare 자격증명 구성됨 — 자동 연결 가능합니다.';
    }else{
      cfAlert.className='alert a-warn';cfAlert.textContent='⚠ Cloudflare 자격증명이 구성되지 않았습니다. Admin 설정 페이지에서 먼저 API Token / Tunnel ID를 등록하세요.';
    }
  }
  // Update DNS target in tab 1 (manual guide) with actual tunnel ID if available
  var tunnelIdVal=(domainTunnel&&domainTunnel.tunnelId)?domainTunnel.tunnelId+'':'<tunnel-id>';
  document.getElementById('ext-dns-target').textContent=tunnelIdVal+'.cfargotunnel.com';
  switchTab('domain',0);updateCfPreview();
  openModal('modal-domain');
}

function updateCfPreview(){
  var d=document.getElementById('cf-domain').value||'example.com';
  var s=document.getElementById('cf-sub').value;
  document.getElementById('cf-preview').textContent=s?s+'.'+d:d;
}

function updateExtPreview(){
  var v=document.getElementById('ext-sub').value;
  var parts=v.split('.');
  document.getElementById('ext-dns-name').textContent=parts[0]||'myapp';
}

function updateSubPreview(){
  var base=document.getElementById('sub-base').value||'example.com';
  var prefix=document.getElementById('sub-prefix').value||'myapp';
  document.getElementById('sub-base-display').textContent='.'+base;
  document.getElementById('sub-preview').textContent=prefix+'.'+base;
}

async function submitDomain(){
  if(!domainTargetName)return;
  var subdomain='',domain='';
  if(currentDomainTab===0){
    domain=document.getElementById('cf-domain').value.trim();
    subdomain=document.getElementById('cf-sub').value.trim();
    if(!domain){showToast('⚠ 도메인을 입력하세요');return;}
    if(!subdomain){showToast('⚠ 서브도메인을 입력하세요');return;}
    if(!domainCredentialsConfigured){showToast('⚠ Cloudflare 자격증명이 구성되지 않았습니다. 설정 페이지에서 먼저 등록하세요.');return;}
  }else if(currentDomainTab===1){
    var full=document.getElementById('ext-sub').value.trim();
    if(!full||full.indexOf('.')<1){showToast('⚠ 전체 서브도메인을 입력하세요 (예: myapp.example.com)');return;}
    var dotIdx=full.indexOf('.');
    subdomain=full.slice(0,dotIdx);
    domain=full.slice(dotIdx+1);
    if(!subdomain||!domain){showToast('⚠ 유효한 도메인 형식이 아닙니다');return;}
  }else{
    domain=document.getElementById('sub-base').value;
    subdomain=document.getElementById('sub-prefix').value.trim();
    if(!domain||!subdomain){showToast('⚠ 도메인과 서브도메인 프리픽스를 입력하세요');return;}
  }
  var payload={appName:domainTargetName,subdomain:subdomain,domain:domain};
  var r=await apiFetch('/api/domain/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(r.ok){
    closeModal('modal-domain');
    showToast('🌐 도메인 연결 완료: '+subdomain+'.'+domain);
    await loadDomains();renderApps();
  }
}

/* ─── DELETE MODAL ─── */
function openDeleteModal(name){
  deleteTargetName=name;
  var app=apps.find(function(a){return a.name===name;});
  document.getElementById('delete-app-name').textContent=name;
  document.getElementById('delete-confirm-input').value='';
  document.getElementById('delete-submit-btn').disabled=true;
  var isRunning=app&&(uiStatus(app)==='running'||uiStatus(app)==='building');
  document.getElementById('delete-warn-running').style.display=isRunning?'block':'none';
  document.getElementById('delete-warn-normal').style.display=isRunning?'none':'block';
  if(isRunning){document.getElementById('delete-submit-btn').disabled=true;}
  openModal('modal-delete');
}

function checkDeleteConfirm(){
  var app=apps.find(function(a){return a.name===deleteTargetName;});
  if(!app||uiStatus(app)==='running'||uiStatus(app)==='building'){
    document.getElementById('delete-submit-btn').disabled=true;return;
  }
  var val=document.getElementById('delete-confirm-input').value;
  document.getElementById('delete-submit-btn').disabled=(val!==deleteTargetName);
}

async function confirmDelete(){
  var app=apps.find(function(a){return a.name===deleteTargetName;});
  if(!app)return;
  var st=uiStatus(app);
  if(st==='running'||st==='building'){showToast('\u26a0 \uc2e4\ud589 \uc911\uc778 \uc571\uc740 \uc0ad\uc81c\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4');return;}
  var r=await apiFetch('/api/apps/'+encodeURIComponent(deleteTargetName),{method:'DELETE'});
  if(r.ok){
    closeModal('modal-delete');
    showToast('\uD83D\uDDD1 '+deleteTargetName+' \uc0ad\uc81c \uc644\ub8cc');
    await refreshAll();
  }
}

/* ─── COPY ─── */
function copyText(elId,msg){
  var txt=document.getElementById(elId).textContent;
  navigator.clipboard.writeText(txt).catch(function(){});
  showToast('\uD83D\uDCCB '+(msg||'\ubcf5\uc0ac\ub428!'));
}

/* ─── TOAST ─── */
function showToast(msg){
  var t=document.getElementById('toast');
  t.textContent=msg;t.style.display='flex';
  clearTimeout(t._timer);
  t._timer=setTimeout(function(){t.style.display='none';},2600);
}

/* ─── INIT ─── */
window.addEventListener('load',function(){
  renderBpGrid();
  renderLangGrid();
  document.getElementById('sub-base').addEventListener('change',updateSubPreview);
  document.getElementById('proj-name').addEventListener('input',updateProjPreview);
  document.getElementById('proj-port').addEventListener('input',updateProjPreview);
  // Restore building state for creating-status apps from localStorage
  var pending=JSON.parse(localStorage.getItem('bn_pending_jobs')||'{}');
  Object.keys(pending).forEach(function(jobId){
    var appName=pending[jobId];
    startJobPoll(jobId,appName,6);
  });
  refreshAll();
});
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// App Detail page (/apps/:name) — 4 tabs: Overview | Git | Deploy | Logs
// ---------------------------------------------------------------------------

export function generateAppDetailHtml(appName: string, opts?: { zoneName?: string; tunnelId?: string }): string {
  const esc = (s: string) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Brewnet \u2014 ${esc(appName)}</title>
<link rel="icon" type="image/svg+xml" href="/icon.svg"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:'Courier New',monospace;font-size:14px;padding:0}
.site-header{height:50px;background:#0c1525;border-bottom:1px solid #1a2d47;display:flex;align-items:center;justify-content:space-between;padding:0 24px}
.site-header .logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:#c9d1d9}
.site-header .logo-text{display:flex;flex-direction:column;line-height:1.25}
.site-header .logo-name{font-size:16px;font-weight:800;color:#f5a623;font-family:'Courier New',monospace}
.site-header .logo-tag{font-size:9.5px;color:#3a5070;font-weight:400}
.site-header .hnav{display:flex;align-items:center;gap:10px}
.site-header .hnav a{font-size:12px;color:#8b949e;text-decoration:none;padding:5px 12px;border-radius:6px;border:1px solid #30363d;font-family:inherit;transition:all .14s}
.site-header .hnav a:hover{color:#c9d1d9;background:#21262d}
.site-header .hnav a.active{color:#f5a623;border-color:rgba(245,166,35,.3);background:rgba(245,166,35,.06)}
.page-body{padding:24px}
h1{color:#f5a623;font-size:18px;display:flex;align-items:center;gap:10px;margin-bottom:2px}
.subtitle{color:#8b949e;font-size:12px;margin-bottom:20px}
.header-row{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px}
.nav-link{color:#58a6ff;font-size:13px;text-decoration:none;border:1px solid #30363d;padding:4px 10px;border-radius:4px;font-family:inherit}
.nav-link:hover{background:#21262d}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.running{background:#1a4731;color:#3fb950}.stopped{background:#3d1f1f;color:#f85149}
.tabs{display:flex;border-bottom:1px solid #30363d;margin-bottom:20px}
.tab{padding:8px 18px;cursor:pointer;color:#8b949e;font-size:13px;background:none;border:none;font-family:inherit;border-bottom:2px solid transparent;margin-bottom:-1px}
.tab:hover{color:#c9d1d9}.tab.active{color:#f5a623;border-bottom-color:#f5a623}
.tab-panel{display:none}.tab-panel.active{display:block}
.section{margin-bottom:20px}
.section-title{color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.info-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #21262d;font-size:13px}
.info-key{color:#8b949e;min-width:120px}.info-val{color:#c9d1d9;font-family:monospace;word-break:break-all}
.btn{padding:4px 12px;border:1px solid;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;background:transparent;margin-left:6px}
.btn-primary{background:#f5a623;color:#0d1117;border-color:#f5a623;font-weight:700}
.btn-primary:hover{background:#e09420}
.btn-stop{border-color:#f85149;color:#f85149}.btn-stop:hover{background:#3d1f1f}
.btn-start{border-color:#3fb950;color:#3fb950}.btn-start:hover{background:#1a4731}
.btn-default{border-color:#30363d;color:#8b949e}.btn-default:hover{background:#21262d}
.code-block{position:relative;background:#161b22;border:1px solid #30363d;border-radius:6px;padding:12px;font-family:monospace;font-size:12px;color:#c9d1d9;white-space:pre-wrap;word-break:break-all;margin-bottom:8px}
.copy-btn{position:absolute;top:8px;right:8px;padding:2px 8px;border:1px solid #30363d;border-radius:4px;cursor:pointer;background:#0d1117;color:#8b949e;font-size:11px;font-family:inherit}
.copy-btn:hover{background:#21262d;color:#c9d1d9}
.history-row{display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid #21262d;font-size:12px}
.history-hash{color:#58a6ff;font-family:monospace}.history-msg{flex:1;color:#c9d1d9}.history-time{color:#8b949e;white-space:nowrap}
.toggle-row{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.toggle{position:relative;display:inline-block;width:38px;height:20px}
.toggle input{opacity:0;width:0;height:0}
.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#30363d;border-radius:20px;transition:.2s}
.slider:before{position:absolute;content:"";height:14px;width:14px;left:3px;bottom:3px;background:#c9d1d9;border-radius:50%;transition:.2s}
input:checked+.slider{background:#f5a623}
input:checked+.slider:before{transform:translateX(18px)}
#log-output{background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:12px;height:420px;overflow-y:auto;font-family:monospace;font-size:12px;color:#c9d1d9;white-space:pre-wrap}
.log-err{color:#f85149}.log-warn{color:#e3b341}
a.ext{color:#58a6ff;text-decoration:none}a.ext:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="site-header">
  <a href="/" class="logo">
    <svg width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="#f5a623" stroke-linecap="round" stroke-linejoin="round"><path d="M8 26H32V34C32 36.8 29.8 39 27 39H13C10.2 39 8 36.8 8 34V26Z" stroke-width="3.2" fill="none"/><path d="M32 28.5C35.5 28.5 37 30.5 37 32.5C37 34.5 35.5 36.5 32 36.5" stroke-width="3.2" fill="none"/><circle cx="20" cy="30" r="1.8" fill="#f5a623" stroke="none"/><path d="M16.5 20a5 5 0 0 1 7 0" stroke-width="3" fill="none"/><path d="M13.5 15.5a10 10 0 0 1 13 0" stroke-width="3" fill="none"/><path d="M10.5 11a15 15 0 0 1 19 0" stroke-width="3" fill="none"/></svg>
    <span class="logo-text"><span class="logo-name">Brewnet</span><span class="logo-tag">Your server on tap. Just brew it.</span></span>
  </a>
  <div class="hnav">
    <a href="/">Dashboard</a>
    <a href="/apps" class="active">Apps</a>
  </div>
</div>
<div class="page-body">
<div class="header-row">
  <div>
    <h1 id="app-name">${esc(appName)} <span id="app-badge" class="badge stopped">loading</span></h1>
    <div class="subtitle" id="app-subtitle">loading...</div>
  </div>
  <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
    <a href="/apps" class="nav-link">\u2190 Apps</a>
    <button class="btn btn-default" id="btn-open" onclick="openApp()" style="display:none">Open \u2192</button>
    <button class="btn btn-stop" id="btn-stop" onclick="doStop()" style="display:none">Stop</button>
    <button class="btn btn-start" id="btn-start" onclick="doStart()" style="display:none">Start</button>
  </div>
</div>

<div class="tabs">
  <button class="tab active" onclick="switchTab('overview')" id="tabn-overview">Overview</button>
  <button class="tab" onclick="switchTab('git')" id="tabn-git">Git</button>
  <button class="tab" onclick="switchTab('deploy')" id="tabn-deploy">Deploy</button>
  <button class="tab" onclick="switchTab('logs')" id="tabn-logs">Logs</button>
  <button class="tab" onclick="switchTab('domain')" id="tabn-domain">Domain</button>
</div>

<!-- OVERVIEW -->
<div id="tab-overview" class="tab-panel active">
  <div class="section">
    <div class="section-title">App Info</div>
    <div class="info-row"><span class="info-key">Name</span><span class="info-val">${esc(appName)}</span></div>
    <div class="info-row"><span class="info-key">Mode</span><span class="info-val" id="ov-mode">\u2014</span></div>
    <div class="info-row"><span class="info-key">Stack</span><span class="info-val" id="ov-stack">\u2014</span></div>
    <div class="info-row"><span class="info-key">Port</span><span class="info-val" id="ov-port">\u2014</span></div>
    <div class="info-row"><span class="info-key">Status</span><span class="info-val" id="ov-status">\u2014</span></div>
    <div class="info-row"><span class="info-key">Local URL</span><span class="info-val" id="ov-url">\u2014</span></div>
    <div class="info-row"><span class="info-key">Created</span><span class="info-val" id="ov-created">\u2014</span></div>
  </div>
</div>

<!-- GIT -->
<div id="tab-git" class="tab-panel">
  <div class="section">
    <div class="section-title">Repository</div>
    <div class="info-row"><span class="info-key">Gitea URL</span><span class="info-val" id="git-url">\u2014</span></div>
    <div class="info-row"><span class="info-key">Branch</span><span class="info-val" id="git-branch">\u2014</span></div>
    <div class="info-row"><span class="info-key">Latest Commit</span><span class="info-val" id="git-commit">\u2014</span></div>
  </div>
  <div class="section">
    <div class="section-title">Clone (HTTP)</div>
    <div class="code-block" id="git-clone-http">loading...<button class="copy-btn" onclick="copyEl('git-clone-http')">Copy</button></div>
  </div>
  <div class="section">
    <div class="section-title">Clone (SSH)</div>
    <div class="code-block" id="git-clone-ssh">loading...<button class="copy-btn" onclick="copyEl('git-clone-ssh')">Copy</button></div>
  </div>
  <div class="section">
    <div class="section-title">Local Path</div>
    <div class="code-block" id="git-local-path">\u2014</div>
  </div>
  <div class="section">
    <div class="section-title">Quick Setup (run on your dev machine)</div>
    <div class="code-block" id="git-setup-cmds">loading...<button class="copy-btn" onclick="copyEl('git-setup-cmds')">Copy</button></div>
  </div>
</div>

<!-- DEPLOY -->
<div id="tab-deploy" class="tab-panel">
  <div class="section">
    <div class="section-title">Deploy Settings</div>
    <div class="toggle-row">
      <label class="toggle"><input type="checkbox" id="auto-deploy-toggle" onchange="saveSettings()"/><span class="slider"></span></label>
      <span style="font-size:13px">Auto Deploy (on git push to branch)</span>
    </div>
    <div class="info-row" style="margin-bottom:14px">
      <span class="info-key">Deploy Branch</span>
      <input id="deploy-branch-input" value="main" style="background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;padding:4px 8px;font-family:monospace;font-size:12px;width:160px" onchange="saveSettings()"/>
    </div>
    <button class="btn btn-primary" onclick="triggerDeploy()">Deploy Now</button>
    <span id="deploy-msg" style="margin-left:12px;font-size:12px;color:#8b949e"></span>
  </div>
  <div class="section" style="margin-top:20px">
    <div class="section-title">Deploy History</div>
    <div id="deploy-history"><span style="color:#8b949e;font-size:12px">Loading...</span></div>
  </div>
</div>

<!-- LOGS -->
<div id="tab-logs" class="tab-panel">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
    <span style="font-size:12px;color:#8b949e">Live container logs</span>
    <button class="btn btn-default" onclick="startLogs()" style="font-size:11px">Reconnect</button>
    <button class="btn btn-default" onclick="document.getElementById('log-output').innerHTML=''" style="font-size:11px">Clear</button>
  </div>
  <div id="log-output"></div>
</div>

<!-- DOMAIN -->
<div id="tab-domain" class="tab-panel">
  <div class="section">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      External Domain
      <span style="display:flex;gap:6px;align-items:center">
        <input id="dom-pw" type="password" placeholder="Admin password"
          style="background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:4px 8px;
                 color:#c9d1d9;font-family:inherit;font-size:11px;width:140px"/>
        <button class="btn btn-default" onclick="loadDomain()" style="font-size:11px">Refresh</button>
      </span>
    </div>
    <div id="dom-status" style="padding:8px 0;font-size:13px;color:#8b949e">
      Enter admin password and click Refresh to check domain status.
    </div>
  </div>

  <!-- Connected state (shown when domain is connected) -->
  <div id="dom-connected-section" style="display:none">
    <div class="section">
      <div class="section-title">Connection</div>
      <div class="info-row">
        <span class="info-key">External URL</span>
        <span class="info-val" id="dom-ext-url">\u2014</span>
      </div>
      <div class="info-row">
        <span class="info-key">Connected</span>
        <span class="info-val" id="dom-connected-at">\u2014</span>
      </div>
      <button class="btn btn-stop" style="margin-top:12px" onclick="disconnectAppDomain()">Disconnect</button>
    </div>
  </div>

  <!-- Connect form (shown when no domain connected) -->
  <div id="dom-form-section" style="display:none">
    <div class="section">
      <div class="section-title">Connect Domain</div>
      <div class="info-row" style="margin-bottom:8px">
        <span class="info-key">Subdomain</span>
        <input id="dom-sub" type="text" placeholder="${esc(appName)}"
          style="background:#0d1117;border:1px solid #30363d;border-radius:4px;
                 color:#c9d1d9;padding:4px 8px;font-family:monospace;font-size:12px;width:200px"/>
      </div>
      <div class="info-row" style="margin-bottom:12px">
        <span class="info-key">Domain</span>
        <input id="dom-domain" type="text" placeholder="yourdomain.com"
          style="background:#0d1117;border:1px solid #30363d;border-radius:4px;
                 color:#c9d1d9;padding:4px 8px;font-family:monospace;font-size:12px;width:200px"/>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" onclick="connectAppDomain()">Connect</button>
        <button class="btn btn-default" style="font-size:11px" onclick="toggleCnameGuide()">CNAME Guide</button>
      </div>
      <div id="dom-steps" style="margin-top:12px;font-size:12px;color:#8b949e"></div>
    </div>

    <!-- CNAME Guide (collapsible) -->
    <div id="dom-cname-guide" style="display:none">
      <div class="section">
        <div class="section-title">CNAME Setup (Scenario C \u2014 NS \uc774\uc804 \ubd88\uac00)</div>
        <div class="code-block" id="dom-cname-val">
          \u2014 (tunnelId \ud544\uc694, admin CNAME Guide \ucc38\uc870)
        </div>
        <div style="font-size:12px;color:#8b949e;margin-top:8px">
          \uc704 CNAME \uac12\uc744 DNS \uc81c\uacf5\uc790(GoDaddy, Namecheap, \uac00\ube44\uc544 \ub4f1)\uc5d0\uc11c
          <code style="color:#f5a623">{subdomain}</code> \u2192 CNAME \u2192 <code style="color:#f5a623">{tunnelId}.cfargotunnel.com</code> \uc73c\ub85c \ub4f1\ub85d\ud558\uc138\uc694.
        </div>
      </div>
    </div>
  </div>
</div>

<script>
var APP=${JSON.stringify(appName)};
var DOMAIN_HINT=${JSON.stringify({ zoneName: opts?.zoneName ?? '', tunnelId: opts?.tunnelId ?? '' })};
var appData=null;
var gitData=null;
var logSrc=null;
var activeTab='overview';
var gitLoaded=false;
var domainLoaded=false;
var domainData=null;

function switchTab(tab){
  activeTab=tab;
  ['overview','git','deploy','logs','domain'].forEach(function(t){
    document.getElementById('tabn-'+t).className='tab'+(t===tab?' active':'');
    document.getElementById('tab-'+t).className='tab-panel'+(t===tab?' active':'');
  });
  if(tab==='git'&&!gitLoaded)loadGit();
  if(tab==='deploy'){loadSettings();loadHistory();}
  if(tab==='logs'&&!logSrc)startLogs();
  if(tab==='domain'&&!domainLoaded)loadDomain();
}

function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

async function loadApp(){
  var r=await fetch('/api/apps/'+encodeURIComponent(APP)).then(function(r){return r.json();}).catch(function(){return null;});
  if(!r||!r.app){document.getElementById('app-subtitle').textContent='App not found';return;}
  appData=r.app;var a=r.app;
  var badge=document.getElementById('app-badge');
  badge.textContent=a.status;badge.className='badge '+(a.status==='running'?'running':'stopped');
  document.getElementById('app-subtitle').textContent=(a.lang||'')+(a.framework?' \u00b7 '+a.framework:'')+(a.port?' \u00b7 Port '+a.port:'');
  document.getElementById('ov-mode').textContent=a.mode||'\u2014';
  document.getElementById('ov-stack').textContent=a.stackId||a.sourceUrl||'\u2014';
  document.getElementById('ov-port').textContent=a.port||'\u2014';
  document.getElementById('ov-status').textContent=a.status||'\u2014';
  var lu=a.port?'http://localhost:'+a.port:'';
  document.getElementById('ov-url').innerHTML=lu?'<a class="ext" href="'+lu+'" target="_blank">'+lu+'</a>':'\u2014';
  document.getElementById('ov-created').textContent=(a.createdAt||'\u2014').replace('T',' ').slice(0,16);
  document.getElementById('btn-open').style.display=lu?'':'none';
  document.getElementById('btn-stop').style.display=a.status==='running'?'':'none';
  document.getElementById('btn-start').style.display=a.status!=='running'?'':'none';
}
function openApp(){if(appData&&appData.port)window.open('http://localhost:'+appData.port,'_blank');}
async function doStop(){await fetch('/api/apps/'+encodeURIComponent(APP)+'/stop',{method:'POST'});loadApp();}
async function doStart(){await fetch('/api/apps/'+encodeURIComponent(APP)+'/start',{method:'POST'});loadApp();}

async function loadGit(){
  gitLoaded=true;
  var r=await fetch('/api/apps/'+encodeURIComponent(APP)+'/git').then(function(r){return r.json();}).catch(function(){return null;});
  if(!r||!r.git){document.getElementById('git-url').textContent='Gitea not available';return;}
  gitData=r.git;var g=r.git;
  document.getElementById('git-url').innerHTML='<a class="ext" href="'+escH(g.giteaUrl)+'" target="_blank">'+escH(g.giteaUrl)+' [Open]</a>';
  document.getElementById('git-branch').textContent=g.branch||'main';
  var c=g.latestCommit;
  document.getElementById('git-commit').textContent=c?(c.shortHash+' \u2014 '+c.message):'(empty repo)';
  setText('git-clone-http','git clone '+g.cloneUrlHttp);
  setText('git-clone-ssh','git clone '+g.cloneUrlSsh);
  setText('git-local-path',g.localPath);
  setText('git-setup-cmds','git remote add brewnet '+g.cloneUrlHttp+'\\ngit push brewnet '+(g.branch||'main'));
}
function setText(id,val){
  var el=document.getElementById(id);if(!el)return;
  var btn=el.querySelector('.copy-btn');
  var html=escH(val);
  el.innerHTML=html+(btn?'<button class="copy-btn" onclick="copyEl(&#39;'+id+'&#39;)">Copy</button>':'');
}
function copyEl(id){
  var el=document.getElementById(id);if(!el)return;
  var txt=el.textContent||el.innerText;
  navigator.clipboard.writeText(txt.replace(/Copy$/,'').trim());
  var btn=el.querySelector('.copy-btn');
  if(btn){btn.textContent='Copied!';setTimeout(function(){btn.textContent='Copy';},1500);}
}

async function loadSettings(){
  var r=await fetch('/api/apps/'+encodeURIComponent(APP)+'/deploy/settings').then(function(r){return r.json();}).catch(function(){return null;});
  if(!r)return;
  document.getElementById('auto-deploy-toggle').checked=!!r.autoDeploy;
  document.getElementById('deploy-branch-input').value=r.deployBranch||'main';
}
async function saveSettings(){
  var ad=document.getElementById('auto-deploy-toggle').checked;
  var br=(document.getElementById('deploy-branch-input').value||'main').trim();
  await fetch('/api/apps/'+encodeURIComponent(APP)+'/deploy/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({autoDeploy:ad,deployBranch:br})});
}
async function triggerDeploy(){
  var msg=document.getElementById('deploy-msg');msg.textContent='Deploying...';
  var r=await fetch('/api/apps/'+encodeURIComponent(APP)+'/deploy',{method:'POST'}).then(function(r){return r.json();}).catch(function(e){return{error:e.message};});
  if(r.error){msg.textContent='Error: '+r.error;return;}
  msg.textContent='Job '+r.jobId+' started...';
  var t=setInterval(async function(){
    var jr=await fetch('/api/apps/jobs/'+encodeURIComponent(r.jobId)).then(function(r){return r.json();}).catch(function(){return null;});
    if(!jr)return;
    if(jr.status==='done'){clearInterval(t);msg.textContent='\u2713 Deploy successful';loadHistory();loadApp();}
    else if(jr.status==='failed'){clearInterval(t);msg.textContent='\u2717 Failed: '+(jr.error||'');loadHistory();}
  },2000);
}
async function loadHistory(){
  var r=await fetch('/api/deploy/history?app='+encodeURIComponent(APP)).then(function(r){return r.json();}).catch(function(){return{history:[]};});
  var entries=(r.history||[]).slice().reverse();
  var div=document.getElementById('deploy-history');
  if(!entries.length){div.innerHTML='<span style="color:#8b949e;font-size:12px">No deployments yet.</span>';return;}
  div.innerHTML=entries.map(function(e){
    var icon=e.status==='success'?'<span style="color:#3fb950">\u2705</span>':'<span style="color:#f85149">\u274c</span>';
    var t=(e.deployedAt||'').replace('T',' ').slice(0,16);
    return '<div class="history-row">'+icon+'<span class="history-hash">'+(e.commitHash?e.commitHash.slice(0,7):'\u2014')+'</span><span class="history-msg">'+escH(e.commitMessage||'deploy')+'</span><span class="history-time">'+t+'</span></div>';
  }).join('');
}

function startLogs(){
  if(logSrc)logSrc.close();
  var out=document.getElementById('log-output');
  out.innerHTML='<span style="color:#8b949e">Connecting...</span>\\n';
  logSrc=new EventSource('/api/apps/'+encodeURIComponent(APP)+'/logs');
  logSrc.onmessage=function(e){
    var div=document.createElement('div');
    div.className=/error|fatal/i.test(e.data)?'log-err':/warn/i.test(e.data)?'log-warn':'';
    div.textContent=e.data;out.appendChild(div);out.scrollTop=out.scrollHeight;
  };
  logSrc.onerror=function(){
    var div=document.createElement('div');div.textContent='[stream ended]';div.style.color='#8b949e';out.appendChild(div);
    logSrc=null;
  };
}

// \u2500\u2500 Domain tab functions \u2500\u2500
function domainFetch(url,opts){
  var pw=document.getElementById('dom-pw').value||'';
  var h=Object.assign({'Content-Type':'application/json','X-Admin-Password':pw},(opts&&opts.headers)||{});
  return fetch(url,Object.assign({},opts,{headers:h}));
}
async function loadDomain(){
  domainLoaded=true;
  var statusEl=document.getElementById('dom-status');
  var connectedSec=document.getElementById('dom-connected-section');
  var formSec=document.getElementById('dom-form-section');
  statusEl.textContent='Loading...';
  var r=await domainFetch('/api/domain/status/'+encodeURIComponent(APP)).then(function(r){return r.json();}).catch(function(){return null;});
  if(!r){statusEl.textContent='Failed to load \u2014 check admin password.';return;}
  if(r.message&&(r.message.includes('Unauthorized')||r.message.includes('nauthorized'))){
    statusEl.textContent='Unauthorized \u2014 check admin password.';return;
  }
  var ext=r.external||{};
  if(ext.connected){
    statusEl.textContent='';
    connectedSec.style.display='';formSec.style.display='none';
    var url='https://'+(ext.hostname||'');
    document.getElementById('dom-ext-url').innerHTML='<a class="ext" href="'+url+'" target="_blank">'+url+'</a>';
    document.getElementById('dom-connected-at').textContent=(ext.connectedAt||'\u2014').replace('T',' ').slice(0,16);
  }else{
    statusEl.textContent='No external domain connected.';
    connectedSec.style.display='none';formSec.style.display='';
    document.getElementById('dom-sub').value=APP;
    if(DOMAIN_HINT.zoneName)document.getElementById('dom-domain').value=DOMAIN_HINT.zoneName;
    if(DOMAIN_HINT.tunnelId){
      document.getElementById('dom-cname-val').textContent=DOMAIN_HINT.tunnelId+'.cfargotunnel.com';
    }
  }
}
async function connectAppDomain(){
  var sub=document.getElementById('dom-sub').value.trim();
  var dom=document.getElementById('dom-domain').value.trim();
  var stepsDiv=document.getElementById('dom-steps');
  if(!sub||!dom){stepsDiv.textContent='Subdomain and domain are required.';return;}
  stepsDiv.innerHTML='<span style="color:#e3b341">\u23f3 Connecting...</span>';
  try{
    var r=await domainFetch('/api/domain/connect',{method:'POST',body:JSON.stringify({appName:APP,subdomain:sub,domain:dom})});
    var d=await r.json();
    if(d.success){
      var html=(d.steps||[]).map(function(s){return '<div>'+(s.status==='completed'?'\u2705':'\u274c')+' '+escH(s.step)+'</div>';}).join('');
      stepsDiv.innerHTML=html+'<div style="color:#3fb950;margin-top:8px">\u2705 '+escH(d.externalUrl)+' is live!</div>';
      setTimeout(function(){domainLoaded=false;loadDomain();},1500);
    }else{
      stepsDiv.innerHTML='<span style="color:#f85149">\u274c '+escH(d.message||d.error||'Unknown error')+'</span>';
    }
  }catch(e){stepsDiv.innerHTML='<span style="color:#f85149">Error: '+escH(e.message)+'</span>';}
}
async function disconnectAppDomain(){
  if(!confirm('Disconnect '+APP+' from external domain?'))return;
  var r=await domainFetch('/api/domain/disconnect/'+encodeURIComponent(APP),{method:'DELETE'});
  var d=await r.json();
  if(d.success){domainLoaded=false;loadDomain();}
  else{alert('Disconnect failed: '+(d.message||d.error||'Unknown error'));}
}
function toggleCnameGuide(){
  var g=document.getElementById('dom-cname-guide');
  g.style.display=g.style.display==='none'?'':'none';
}

loadApp();setInterval(loadApp,15000);
</script>
</div>
</body>
</html>`;
}
