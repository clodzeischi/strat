import {
  BUILDINGS, FACTIONS, PRODUCERS, SELF_REPAIR_RATE, TILE, UPGRADES, reqName, shieldsFor,
  type BuildingType, type LevelUpType, type Req, type ResearchSlot, type UnitType, type UpgradeType, type WeaponDef,
} from '../config';
import { Building, SALVAGE, Unit } from '../entities';
import type { Game } from '../game/game';
import type { Input } from './input';
import { icon, type IconKey } from './icons';
import { GRID_KEYS, keyLabel, onKeyLabels, type GridKey } from './keys';

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const reqList = (reqs: Req[]) => reqs.map(reqName).join(', ');

function weaponLine(w: WeaponDef): string {
  const bonus = Object.entries(w.bonus).map(([t, v]) => `${v! > 0 ? '+' : ''}${v} vs ${cap(t)}`).join(', ');
  const range = w.minRange ? `${w.minRange / TILE}-${w.range / TILE}` : `${w.range / TILE}`;
  return `Damage ${w.damage}${bonus ? ` (${bonus})` : ''}  Range ${range} tiles`;
}

type Tab = 'build' | 'train' | 'research' | 'command';
const TABS: { id: Tab; name: string }[] = [
  { id: 'build', name: 'Build' },
  { id: 'train', name: 'Train' },
  { id: 'research', name: 'Upgrade' },
  { id: 'command', name: 'Command' },
];

/** How a slot looks this frame. */
interface SlotView {
  /** Not unlocked yet: shown dimmed, with what it needs in the tooltip. */
  locked?: boolean;
  /** Can't be used right now (busy, no money for a command, nothing selected that can do it). */
  disabled?: boolean;
  /** Researched already. */
  done?: boolean;
  /** Armed (attack-move or drop waiting for a click). */
  active?: boolean;
  /** Ready to place: pulses. */
  ready?: boolean;
  progress?: number | null;
  badge?: string;
  status?: string;
}

/** One button in rows 2-3 of a tab. */
interface Slot {
  icon: () => IconKey;
  name: () => string;
  /** Price in credits; 0 for commands. */
  cost: () => number;
  tip: () => string;
  view: () => SlotView;
  /** Left click or hotkey. */
  use: () => void;
  /** Right click: cancel or dequeue. */
  cancel?: () => void;
}

interface CardEl {
  el: HTMLElement;
  icon: HTMLElement;
  cost: HTMLElement;
  key: HTMLElement;
  wipe: HTMLElement;
  badge: HTMLElement;
  status: HTMLElement;
  /** What's drawn, to skip DOM writes when nothing changed. */
  iconKey: string;
  state: string;
}

/**
 * Stormgate-style 4x3 command card, bottom left. The top row (Q W E R by position) picks a tab: Build, Train,
 * Research or Command. The two rows below (A S D F, Z X C V) hold that tab's buttons, always in the same places.
 * Selecting units or a building with orders opens the Command tab, so A is attack-move whenever an army is selected;
 * letting go of them returns to the tab you were on. The Command tab shows what the selection's lead kind can do
 * (the highest tier in a mix, Tab for the next): attack-move and stop for any units, plus Drop for Carryalls, Rally
 * for production buildings, Unload and Salvage for bunkers. Everything is sent through `input.issue` as commands,
 * like any player action.
 */
export class CommandCard {
  private tab: Tab = 'build';
  /** The tab before selecting units switched to Command, to go back to. */
  private before: Tab = 'build';
  private following = false;
  private selected = new Set<number>();
  /** The selection's lead kind last frame, to follow Tab. */
  private lead: string | null = null;
  /** Command tab buttons by name, laid out per selection in `commandLayout`. */
  private commands: Record<'attack' | 'stop' | 'drop' | 'unload' | 'rally' | 'salvage' | 'mend', Slot>;
  private tabEls: { el: HTMLElement; key: HTMLElement; bar: HTMLElement; badge: HTMLElement; state: string }[] = [];
  private cells: CardEl[] = [];
  private slots: Record<Tab, (Slot | null)[]>;
  private tipEl: HTMLElement;
  private hovered: number | null = null;
  private tipText = '';

  constructor(private game: Game, private input: Input, root: HTMLElement) {
    this.commands = this.commandSlots();
    this.slots = { build: this.buildSlots(), train: this.trainSlots(), research: this.researchSlots(), command: [] };

    this.tipEl = document.createElement('div');
    this.tipEl.className = 'card-tip';
    this.tipEl.hidden = true;
    root.appendChild(this.tipEl);
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    root.appendChild(grid);

    for (const t of TABS) {
      const el = document.createElement('div');
      el.className = 'tab';
      el.innerHTML = `<div class="key"></div><div class="tab-name">${t.name}</div><div class="badge"></div><div class="tab-bar"><i></i></div>`;
      el.addEventListener('click', () => this.setTab(t.id, true));
      grid.appendChild(el);
      this.tabEls.push({ el, key: el.querySelector('.key')!, bar: el.querySelector('.tab-bar i')!, badge: el.querySelector('.badge')!, state: '' });
    }
    for (let i = 0; i < 8; i++) {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<div class="icon"></div><div class="cost"></div><div class="key"></div><div class="wipe"></div><div class="badge"></div><div class="status"></div>`;
      el.addEventListener('click', () => this.use(i));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.slot(i)?.cancel?.();
      });
      el.addEventListener('mouseenter', () => (this.hovered = i));
      el.addEventListener('mouseleave', () => {
        if (this.hovered === i) this.hovered = null;
      });
      grid.appendChild(el);
      this.cells.push({
        el, icon: el.querySelector('.icon')!, cost: el.querySelector('.cost')!, key: el.querySelector('.key')!,
        wipe: el.querySelector('.wipe')!, badge: el.querySelector('.badge')!, status: el.querySelector('.status')!,
        iconKey: '', state: '',
      });
    }
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.drawKeys();
    onKeyLabels(() => this.drawKeys());

    window.addEventListener('keydown', (e) => this.onKey(e));
    input.onSelect = () => this.followSelection();
  }

  // ---- Tabs and keys ------------------------------------------------------------

  private setTab(tab: Tab, byPlayer = false): void {
    if (byPlayer) this.input.actions++;
    this.tab = tab;
    for (const c of this.cells) c.state = '';
  }

  /** Selecting units (or a building with orders) opens the Command tab; letting go goes back to the tab before. */
  private followSelection(): void {
    const sel = this.input.selection;
    const commandable = this.input.ownUnits().length > 0 || this.input.ownProducers().length > 0 || this.input.ownBunkers().length > 0;
    // Only on picking something new (or Tab to another kind): units dying out of the selection shouldn't pull you
    // off another tab.
    const lead = this.input.active()?.key ?? null;
    const added = sel.some((e) => !this.selected.has(e.id)) || (lead !== this.lead && sel.length > 0);
    this.selected = new Set(sel.map((e) => e.id));
    this.lead = lead;
    if (commandable && added) {
      if (!this.following) this.before = this.tab === 'command' ? this.before : this.tab;
      this.following = true;
      this.setTab('command');
    } else if (!commandable && this.following) {
      this.following = false;
      if (this.tab === 'command') this.setTab(this.before);
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    // Not over a menu screen, and not while typing (the multiplayer name box).
    if (document.querySelector('.screen:not([hidden])') || e.target instanceof HTMLInputElement) return;
    const code = e.code as GridKey;
    const tabIndex = (GRID_KEYS[0] as readonly string[]).indexOf(code);
    if (tabIndex >= 0) {
      e.preventDefault();
      this.setTab(TABS[tabIndex].id, true);
      return;
    }
    const row = (GRID_KEYS[1] as readonly string[]).indexOf(code);
    const row2 = (GRID_KEYS[2] as readonly string[]).indexOf(code);
    const i = row >= 0 ? row : row2 >= 0 ? 4 + row2 : -1;
    if (i < 0) return;
    e.preventDefault();
    this.use(i);
  }

  private drawKeys(): void {
    this.tabEls.forEach((t, i) => (t.key.textContent = keyLabel(GRID_KEYS[0][i])));
    this.cells.forEach((c, i) => (c.key.textContent = keyLabel(GRID_KEYS[1 + Math.floor(i / 4)][i % 4])));
    this.tipText = '';
  }

  private slot(i: number): Slot | null {
    if (this.tab === 'command') return this.commandLayout()[i] ?? null;
    return this.slots[this.tab][i] ?? null;
  }

  /** The Command tab for the selection's lead kind. */
  private commandLayout(): (Slot | null)[] {
    const c = this.commands;
    const lead = this.input.active()?.members[0];
    if (lead instanceof Building && lead.team === this.input.team) {
      if (lead.def.garrison) return [null, null, null, c.unload, null, null, null, c.salvage];
      const mend = FACTIONS[this.faction].selfRepair ? c.mend : null;
      return [this.input.ownProducers().length ? c.rally : null, null, null, null, null, null, null, mend];
    }
    if (!this.input.ownUnits().length) return [];
    const carryalls = lead instanceof Unit && lead.type === 'carryall';
    return [c.attack, c.stop, carryalls ? c.drop : null, null, null, null, null, null];
  }

  private use(i: number): void {
    const s = this.slot(i);
    if (!s) return;
    this.input.actions++;
    s.use();
  }

  // ---- Slots ------------------------------------------------------------------------

  private get ts() {
    return this.game.teams[this.game.localTeam];
  }

  private get faction() {
    return this.ts.faction;
  }

  private buildSlots(): (Slot | null)[] {
    const slot = (t: BuildingType): Slot => {
      const d = BUILDINGS[t];
      return {
        icon: () => t,
        name: () => d.name,
        cost: () => d.cost,
        tip: () => {
          const sh = shieldsFor(this.faction, d);
          const gun = d.weapon ? `\n${weaponLine(d.weapon)}` : '';
          return `${d.desc}\nHP ${d.hp}${sh ? `  Shields ${sh}` : ''}${gun}${d.requires.length ? `\nRequires: ${reqList(d.requires)}` : ''}\nRight-click to cancel.`;
        },
        view: () => {
          const g = this.game;
          const b = this.ts.building;
          const mine = b?.type === t;
          const ready = mine && b!.ready;
          return {
            locked: !mine && !g.requirementsMet(g.localTeam, d.requires),
            disabled: !g.canBuild(g.localTeam, t) || (!!b && !mine),
            progress: mine && !b!.ready ? b!.progress : null,
            status: ready ? (this.input.placing === t ? 'PLACING' : 'READY') : '',
            ready,
          };
        },
        use: () => {
          const g = this.game;
          const b = this.ts.building;
          if (b) {
            if (b.type === t && b.ready) this.input.beginPlacement(t);
            else if (b.type !== t) g.onMessage(`Already building ${BUILDINGS[b.type].name}.`);
          } else if (g.canBuild(g.localTeam, t)) {
            if (this.ts.credits < d.cost) g.onMessage('Insufficient funds.');
            else this.input.issue({ c: 'build', type: t });
          }
        },
        cancel: () => {
          if (this.ts.building?.type !== t) return;
          this.input.issue({ c: 'cancelBuild' });
          this.input.placing = null;
        },
      };
    };
    // Home row: the economy and production line in build order. Bottom row: defense, support, and a spare yard.
    return FACTIONS[this.faction].build.map((t) => (t ? slot(t) : null));
  }

  private trainSlots(): (Slot | null)[] {
    const slot = (t: UnitType): Slot => {
      const d = this.game.unitDef(this.game.localTeam, t);
      const sh = shieldsFor(this.faction, d);
      return {
        icon: () => t,
        name: () => d.name,
        cost: () => d.cost,
        tip: () => {
          const w = d.weapon ? `\n${weaponLine(d.weapon)}` : '';
          const anti = d.antiArmor ? `\nRockets (upgrade): ${weaponLine(d.antiArmor)}` : '';
          return `[${d.tags.map(cap).join(', ')}]\n${d.desc}\nHP ${d.hp}${sh ? `  Shields ${sh}` : ''}  Speed ${d.speed}${w}${anti}\nBuilt at: ${BUILDINGS[d.producer].name}${
            d.requires.length > 1 ? `\nRequires: ${reqList(d.requires)}` : ''}\nRight-click to remove from the queue.`;
        },
        view: () => {
          const g = this.game;
          const queue = this.ts.queues[d.producer];
          const lines = g.activeLines(g.localTeam, d.producer);
          const queued = queue.filter((q) => q.type === t).length;
          const building = queue.slice(0, lines).filter((q) => q.type === t);
          return {
            locked: !queued && !g.requirementsMet(g.localTeam, d.requires),
            disabled: !g.canTrain(g.localTeam, t),
            progress: queued ? Math.max(0, ...building.map((q) => q.progress)) : null,
            badge: queued > 1 ? `${queued}` : '',
          };
        },
        use: () => this.input.issue({ c: 'train', type: t }),
        cancel: () => this.input.issue({ c: 'untrain', type: t }),
      };
    };
    // Home row: the army. Bottom row: support.
    return FACTIONS[this.faction].train.map((t) => (t ? slot(t) : null));
  }

  private researchSlots(): (Slot | null)[] {
    const levelUp = (t: LevelUpType): Slot => {
      const d = BUILDINGS[t].levelUp!;
      return {
        icon: () => `${t}2`,
        name: () => d.name,
        cost: () => d.cost,
        tip: () => `${d.desc}\nTakes ${d.time} s.${d.requires?.length ? `\nRequires: ${reqList(d.requires)}` : ''}\nRight-click to cancel.`,
        view: () => {
          const g = this.game;
          const l = this.ts.levelUps[t];
          const done = !l && g.meets(g.localTeam, `${t}2`);
          const locked = !l && !done && (!g.has(g.localTeam, t) || !g.requirementsMet(g.localTeam, d.requires ?? []));
          return { done, locked, progress: l ? l.progress : null, status: done ? 'DONE' : '' };
        },
        use: () => {
          if (!this.ts.levelUps[t] && this.game.canLevelUp(this.game.localTeam, t)) this.input.issue({ c: 'levelUp', type: t });
        },
        cancel: () => this.input.issue({ c: 'cancelLevelUp', type: t }),
      };
    };
    /** A slot for one upgrade, or a two-tier line (Weapons I then II) that shows the next tier to research. */
    const upgrade = (pick: () => UpgradeType): Slot => {
      const state = () => {
        const g = this.game;
        const t = pick();
        const r = this.ts.research;
        const mine = r?.type === t;
        return { t, r, mine, done: this.ts.upgrades.has(t), g };
      };
      return {
        icon: () => pick(),
        name: () => UPGRADES[pick()].name,
        cost: () => UPGRADES[pick()].cost,
        tip: () => {
          const d = UPGRADES[pick()];
          return `${d.desc}\nRequires: ${reqList(d.requires)}${d.after ? `, ${UPGRADES[d.after].name}` : ''}\nRight-click to cancel.`;
        },
        view: () => {
          const { t, r, mine, done, g } = state();
          return {
            done,
            locked: !mine && !done && !g.canResearch(g.localTeam, t),
            disabled: !!r && !mine,
            progress: mine ? r!.progress : null,
            status: done ? 'DONE' : '',
          };
        },
        use: () => {
          const { t, r, done, g } = state();
          if (done) return;
          if (r && r.type !== t) g.onMessage(`Already researching ${UPGRADES[r.type].name}.`);
          else if (!r) this.input.issue({ c: 'research', type: t });
        },
        cancel: () => {
          if (state().mine) this.input.issue({ c: 'cancelResearch' });
        },
      };
    };
    // A line of upgrades (Weapons I then II) shows the first one not yet researched, or the last once all are done.
    const next = (list: UpgradeType[]) => (): UpgradeType => list.find((u) => !this.ts.upgrades.has(u)) ?? list[list.length - 1];
    const make = (r: ResearchSlot | null) => (!r ? null : 'levelUp' in r ? levelUp(r.levelUp) : upgrade(next(r.upgrades)));
    return FACTIONS[this.faction].research.map(make);
  }

  private commandSlots(): CommandCard['commands'] {
    const input = this.input;
    const command = (key: IconKey, name: string, tip: string, can: () => boolean, active: () => boolean, use: () => void): Slot => ({
      icon: () => key,
      name: () => name,
      cost: () => 0,
      tip: () => tip,
      view: () => ({ disabled: !can(), active: active() }),
      use,
    });
    return {
      attack: command('attack', 'Attack-move',
        'Then click a spot (or the minimap): units move there, fighting anything they meet on the way. Click an enemy to attack it.',
        () => input.canAttackMove(), () => input.attackMode, () => input.attackMove()),
      stop: command('stop', 'Stop', 'Selected units stop what they are doing.', () => input.canStop(), () => false, () => input.stop()),
      drop: command('drop', 'Drop', 'Selected Carryalls: then click where to set down their load (or the minimap). Infantry jump on a fly-by.',
        () => input.canDrop(), () => input.dropMode, () => input.drop()),
      unload: command('unload', 'Unload', 'Selected bunkers let their infantry out.', () => input.canUnload(), () => false, () => input.unload()),
      rally: command('rally', 'Rally Point',
        'Then click a spot (or the minimap): new units from the selected buildings go there, leaving by the side that faces it. Right-clicking the ground does the same.',
        () => input.ownProducers().length > 0, () => input.rallyMode, () => input.rally()),
      mend: {
        icon: () => 'mend',
        name: () => 'Repair',
        cost: () => 0,
        tip: () => `The selected structures mend themselves at ${SELF_REPAIR_RATE} HP/s, paying as they go, while you have a Construction Yard. Right-click to stop.`,
        view: () => {
          const on = input.ownBuildings().some((b) => b.repairing);
          return { disabled: !on && !input.ownBuildings().some((b) => this.game.canSelfRepair(b)), active: on };
        },
        use: () => input.mend(true),
        cancel: () => input.mend(false),
      },
      salvage: {
        icon: () => 'salvage',
        name: () => 'Salvage',
        cost: () => 0,
        tip: () => `Tear down the selected bunkers for ${SALVAGE.refund * 100}% of their price. Takes ${SALVAGE.time} s; the infantry inside come out. Right-click to cancel.`,
        view: () => {
          const p = input.salvageProgress();
          return { disabled: !input.canSalvage() && p === null, active: p !== null, progress: p };
        },
        use: () => (input.canSalvage() ? input.salvage() : input.cancelSalvage()),
        cancel: () => input.cancelSalvage(),
      },
    };
  }

  // ---- Per frame --------------------------------------------------------------------

  update(): void {
    this.drawTabs();
    const credits = this.ts.credits;
    this.cells.forEach((c, i) => this.drawCell(c, this.slot(i), credits));
    this.drawTip();
  }

  /** Each tab shows how its work is going: building progress (pulsing when ready), queued units, research. */
  private drawTabs(): void {
    const ts = this.ts;
    const g = this.game;
    const b = ts.building;
    let trainProgress = 0;
    let queued = 0;
    for (const p of PRODUCERS) {
      queued += ts.queues[p].length;
      for (const q of ts.queues[p].slice(0, g.activeLines(g.localTeam, p))) trainProgress = Math.max(trainProgress, q.progress);
    }
    const levels = Object.values(ts.levelUps).map((l) => l!.progress);
    const research = [ts.research?.progress ?? -1, ...levels];
    const info: Record<Tab, { progress: number | null; ready: boolean; badge: string }> = {
      build: { progress: b && !b.ready ? b.progress : null, ready: !!b?.ready, badge: '' },
      train: { progress: queued ? trainProgress : null, ready: false, badge: queued ? `${queued}` : '' },
      research: { progress: Math.max(...research) >= 0 ? Math.max(...research) : null, ready: false, badge: '' },
      command: { progress: null, ready: false, badge: '' },
    };
    TABS.forEach((t, i) => {
      const el = this.tabEls[i];
      const s = info[t.id];
      const state = `${this.tab === t.id}|${s.progress === null ? -1 : Math.floor(s.progress * 50)}|${s.ready}|${s.badge}`;
      if (state === el.state) return;
      el.state = state;
      el.el.className = `tab${this.tab === t.id ? ' on' : ''}${s.ready ? ' ready' : ''}`;
      el.bar.parentElement!.style.visibility = s.progress === null ? 'hidden' : 'visible';
      el.bar.style.width = `${(s.progress ?? 0) * 100}%`;
      el.badge.textContent = s.badge;
      el.badge.style.display = s.badge ? 'block' : 'none';
    });
  }

  private drawCell(c: CardEl, s: Slot | null, credits: number): void {
    if (!s) {
      if (c.state !== 'empty') {
        c.state = 'empty';
        c.iconKey = '';
        c.el.className = 'card empty';
        c.icon.innerHTML = '';
        c.cost.textContent = '';
        for (const e of [c.wipe, c.badge, c.status]) e.style.display = 'none';
      }
      return;
    }
    const v = s.view();
    const key = s.icon();
    const cost = s.cost();
    const poor = cost > 0 && credits < cost;
    const p = v.progress == null ? -1 : Math.floor(v.progress * 72);
    const state = `${key}|${!!v.locked}|${!!v.disabled}|${!!v.done}|${!!v.active}|${!!v.ready}|${p}|${v.badge ?? ''}|${v.status ?? ''}|${poor}`;
    if (state === c.state) return;
    c.state = state;
    if (key !== c.iconKey) {
      c.iconKey = key;
      c.icon.innerHTML = icon(key, this.game.localTeam);
    }
    const cls = ['card'];
    if (v.locked) cls.push('locked');
    else if (v.done) cls.push('done');
    else if (v.disabled) cls.push('disabled');
    if (v.active) cls.push('active');
    if (v.ready) cls.push('ready');
    c.el.className = cls.join(' ');
    c.cost.textContent = cost && !v.done ? `$${cost}` : '';
    c.cost.classList.toggle('poor', poor);
    if (v.progress == null) c.wipe.style.display = 'none';
    else {
      const deg = v.progress * 360;
      c.wipe.style.display = 'block';
      c.wipe.style.background = `conic-gradient(transparent ${deg}deg, rgba(0,0,0,0.62) ${deg}deg)`;
    }
    c.badge.textContent = v.badge ?? '';
    c.badge.style.display = v.badge ? 'block' : 'none';
    c.status.textContent = v.status ?? '';
    c.status.style.display = v.status ? 'block' : 'none';
  }

  /** The hovered button's name, hotkey, price and details, above the card. */
  private drawTip(): void {
    const s = this.hovered === null ? null : this.slot(this.hovered);
    if (!s) {
      this.tipEl.hidden = true;
      this.tipText = '';
      return;
    }
    const i = this.hovered!;
    const key = keyLabel(GRID_KEYS[1 + Math.floor(i / 4)][i % 4]);
    const cost = s.cost();
    const v = s.view();
    const head = `${s.name()}|${key}|${cost}|${s.tip()}|${!!v.locked}`;
    this.tipEl.hidden = false;
    if (head === this.tipText) return;
    this.tipText = head;
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    this.tipEl.innerHTML =
      `<div class="tip-head"><span class="tip-name">${esc(s.name())}</span><span class="tip-key">${esc(key)}</span>` +
      `${cost ? `<span class="tip-cost">$${cost}</span>` : ''}</div>` +
      `${v.locked ? '<div class="tip-locked">Locked</div>' : ''}<div class="tip-body">${esc(s.tip())}</div>`;
  }
}
