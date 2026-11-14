/* A battle screen laid out like Showdown's: the opponent's Pokémon at the top,
 * yours at the bottom (seen from behind), each with a box for name, HP, status
 * and stat changes, the field effects in between, and each side's party as a
 * row of icons. Phone-first: everything fits on one screen.
 *   VL.battleView(data, snapshot, { me: 'p1', mark: 'p1:Name', turn: 3 })
 * data is a parsed replay (VL.replay.parse), snapshot one of its turn snapshots.
 * VL.battleMoves(...) draws Showdown-style move buttons under it. */
(function () {
  'use strict';
  const VL = (window.VL = window.VL || {});
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STAT = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' };
  const STATUS = { brn: ['BRN', 'Burned'], par: ['PAR', 'Paralyzed'], slp: ['SLP', 'Asleep'], frz: ['FRZ', 'Frozen'], psn: ['PSN', 'Poisoned'], tox: ['TOX', 'Badly poisoned'] };
  const base = (n) => String(n || '').replace(/-(Mega|Mega-[XYZ]|Primal)$/i, '').split('-')[0];
  const hpCls = (hp) => hp > 50 ? 'hi' : hp > 20 ? 'mid' : 'lo';

  function infoBox(m, marked) {
    const boosts = Object.entries(m.boosts || {}).filter(([, v]) => v).map(([k, v]) => `<span class="bv-boost ${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : ''}${v} ${esc(STAT[k] || k)}</span>`).join('');
    const st = m.status && STATUS[m.status];
    return `<div class="bv-info ${marked ? 'marked' : ''}"><div class="bv-name">${esc(m.name)}${m.tera ? ` <span class="bv-tera">Tera ${esc(m.tera)}</span>` : ''}</div>
      <div class="bv-hp"><i class="${hpCls(m.hp)}" style="width:${m.hp}%"></i></div>
      <div class="bv-sub"><span>${m.hp}%</span>${st ? `<span class="bv-st ${esc(m.status)}" title="${esc(st[1])}">${st[0]}</span>` : ''}${boosts}</div></div>`;
  }
  // the party: who's been seen (fainted ones dimmed), who's on the field, and how many are still unknown
  function party(data, sn, side, isMe) {
    const act = new Set(Object.entries(sn.active).filter(([slot]) => slot.startsWith(side)).map(([, k]) => k));
    const seen = sn.order[side].map(k => sn.mons[k]);
    const seenBase = new Set(seen.map(m => base(m.name)));
    const unseen = data.preview[side].filter(n => !seenBase.has(base(n)));
    const icons = sn.order[side].map(k => { const m = sn.mons[k]; return `<span class="bv-pi ${m.fnt ? 'fnt' : ''} ${act.has(k) ? 'act' : ''}" title="${esc(m.name)}${m.fnt ? ' (fainted)' : ` (${m.hp}%)`}">${VL.sprite(m.name, 'xs', false)}</span>`; })
      .concat(unseen.map(n => isMe ? `<span class="bv-pi back" title="${esc(n)} (not used yet)">${VL.sprite(n, 'xs', false)}</span>` : `<span class="bv-pi unk" title="${esc(n)} (brought? not seen yet)">${VL.sprite(n, 'xs', false)}</span>`));
    return `<div class="bv-party">${icons.join('')}</div>`;
  }
  function sideConds(sn, side) { return (sn.side[side] || []).map(x => `<span class="bv-cond">${esc(x)}</span>`).join(''); }

  VL.battleView = function (data, sn, o) {
    o = o || {}; const me = o.me || 'p1'; const opp = me === 'p1' ? 'p2' : 'p1';
    const actives = (side) => Object.entries(sn.active).filter(([slot]) => slot.startsWith(side)).sort().map(([, k]) => k).filter(k => sn.mons[k] && !sn.mons[k].fnt);
    const field = [sn.weather, sn.terrain, ...(sn.room || [])].filter(Boolean);
    const fieldCls = /sun/i.test(sn.weather) ? 'sun' : /rain/i.test(sn.weather) ? 'rain' : /sand/i.test(sn.weather) ? 'sand' : /snow|hail/i.test(sn.weather) ? 'snow' : '';
    const mons = (side, back) => actives(side).map(k => `<div class="bv-slot ${k === o.mark ? 'marked' : ''}">${VL.battleSprite(sn.mons[k].name, back)}</div>`).join('') || '<div class="bv-slot empty"></div>';
    const boxes = (side) => actives(side).map(k => infoBox(sn.mons[k], k === o.mark)).join('');
    return `<div class="bv">
      <div class="bv-bar"><span class="bv-turn">${o.turn ? `Turn ${o.turn}` : 'Leads'}</span>${field.map(x => `<span class="bv-fx">${esc(x)}</span>`).join('')}</div>
      <div class="bv-field ${fieldCls} ${(sn.room || []).some(r => /Trick Room/.test(r)) ? 'tr' : ''}">
        <div class="bv-side opp"><div class="bv-who"><b class="rp-n ${opp}">${esc(data.players[opp] || 'Opponent')}</b>${sideConds(sn, opp)}${party(data, sn, opp, false)}</div><div class="bv-boxes">${boxes(opp)}</div><div class="bv-mons">${mons(opp, false)}</div></div>
        <div class="bv-side mine"><div class="bv-mons">${mons(me, true)}</div><div class="bv-boxes">${boxes(me)}</div><div class="bv-who"><b class="rp-n ${me}">${esc(data.players[me] || 'You')}</b>${sideConds(sn, me)}${party(data, sn, me, true)}</div></div>
      </div></div>`;
  };

  // move buttons like Showdown's: coloured by type, with the category and power
  VL.battleMoves = function (moves, o) {
    o = o || {}; const D = VL.D; const f = o.fmt && D && D.format ? D.format(o.fmt) : null;
    const cat = { P: 'Physical', Sp: 'Special', S: 'Status' };
    return `<div class="bv-moves">${moves.map(mv => {
      const m = D && D.move ? D.move(mv.name, f) : null; const t = (m && m.t) || 'Normal';
      return `<button type="button" class="bv-move ${esc(t)} ${mv.cls || ''}" data-pz="${esc(mv.value)}" ${mv.disabled ? 'disabled' : ''}><b>${esc(mv.name)}</b><span>${esc(t)} · ${m ? esc(cat[m.c] || '') : ''}${m && m.bp ? ' · ' + m.bp : ''}${m && m.p ? ` · priority ${m.p > 0 ? '+' : ''}${m.p}` : ''}</span></button>`;
    }).join('')}</div>`;
  };
})();
