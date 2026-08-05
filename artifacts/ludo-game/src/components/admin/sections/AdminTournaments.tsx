import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Play, Save, CalendarClock, X } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const STAGES = [
  { id: 'group', label: 'Group Stage' },
  { id: 'round-of-128', label: 'Round of 128 (optional)' },
  { id: 'round-of-64', label: 'Round of 64 (optional)' },
  { id: 'round-of-32', label: 'Round of 32' },
  { id: 'round-of-16', label: 'Round of 16' },
  { id: 'quarter-final', label: 'Quarter Final' },
  { id: 'semi-final', label: 'Semi Final' },
  { id: 'final', label: 'Final' },
] as const;
type StageId = typeof STAGES[number]['id'];

type ScheduleItem = {
  id: string;
  stage: StageId;
  matchNumber: number;
  startsAt: string;
};

type Tournament = {
  id: string;
  name: string;
  type: '1v1' | '2v2';
  status: string;
  groupMatchCount: number;
  format: 'auto' | 'direct-knockout' | 'group-stage';
  participantCount: number | null;
  groupCount: number | null;
  entryStage: StageId | null;
  enabledStages: StageId[];
  groupSchedule: ScheduleItem[];
  knockoutSchedule: ScheduleItem[];
  allowTeamRename: boolean;
  registrations: number;
  teams: number;
  createdAt: string;
};

type FormState = {
  name: string;
  type: '1v1' | '2v2';
  groupMatchCount: number;
  enabledStages: StageId[];
  groupSchedule: ScheduleItem[];
  knockoutSchedule: ScheduleItem[];
  allowTeamRename: boolean;
};

const defaultForm: FormState = {
  name: 'Championship',
  type: '1v1',
  groupMatchCount: 3,
  enabledStages: ['group', 'round-of-16', 'quarter-final', 'semi-final', 'final'],
  groupSchedule: [],
  knockoutSchedule: [],
  allowTeamRename: true,
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body as T;
}

function toLocalInput(iso: string) {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function blankSchedule(stage: StageId, matchNumber: number): ScheduleItem {
  return {
    id: `${stage}-${matchNumber}-${Date.now()}`,
    stage,
    matchNumber,
    startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  };
}

function formatLabel(tournament: Tournament) {
  if (tournament.format === 'group-stage') {
    return `${tournament.groupCount ?? 32} Groups → Round of 32`;
  }
  if (tournament.entryStage) {
    return tournament.entryStage === 'final' ? 'Direct Final' : `Starts ${STAGES.find(stage => stage.id === tournament.entryStage)?.label ?? tournament.entryStage}`;
  }
  return 'Auto format';
}

export function AdminTournaments() {
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<{ tournaments: Tournament[]; total: number }>({
    queryKey: ['admin-tournaments', offset],
    queryFn: () => request(`/admin/tournaments?limit=20&offset=${offset}`),
  });

  const tournaments = data?.tournaments ?? [];
  const total = data?.total ?? 0;
  const knockoutStages = useMemo(
    () => form.enabledStages.filter(stage => stage !== 'group'),
    [form.enabledStages],
  );

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setNotice(null);
    setShowEditor(true);
  }

  function openEdit(tournament: Tournament) {
    setEditingId(tournament.id);
    setForm({
      name: tournament.name,
      type: tournament.type,
      groupMatchCount: tournament.groupMatchCount,
      enabledStages: tournament.enabledStages,
      groupSchedule: tournament.groupSchedule ?? [],
      knockoutSchedule: tournament.knockoutSchedule ?? [],
      allowTeamRename: tournament.allowTeamRename,
    });
    setNotice(null);
    setShowEditor(true);
  }

  function toggleStage(stage: StageId) {
    if (stage === 'group') return;
    setForm(current => ({
      ...current,
      enabledStages: current.enabledStages.includes(stage)
        ? current.enabledStages.filter(item => item !== stage)
        : [...current.enabledStages, stage],
    }));
  }

  function addSchedule(stage: StageId) {
    setForm(current => {
      const target = stage === 'group' ? current.groupSchedule : current.knockoutSchedule;
      const nextNumber = target.filter(item => item.stage === stage).length + 1;
      const item = blankSchedule(stage, nextNumber);
      return stage === 'group'
        ? { ...current, groupSchedule: [...target, item] }
        : { ...current, knockoutSchedule: [...target, item] };
    });
  }

  function updateSchedule(stage: StageId, id: string, value: string) {
    const update = (items: ScheduleItem[]) => items.map(item => (
      item.id === id ? { ...item, startsAt: toIso(value) } : item
    ));
    setForm(current => stage === 'group'
      ? { ...current, groupSchedule: update(current.groupSchedule) }
      : { ...current, knockoutSchedule: update(current.knockoutSchedule) });
  }

  function removeSchedule(stage: StageId, id: string) {
    setForm(current => stage === 'group'
      ? { ...current, groupSchedule: current.groupSchedule.filter(item => item.id !== id) }
      : { ...current, knockoutSchedule: current.knockoutSchedule.filter(item => item.id !== id) });
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const path = editingId ? `/admin/tournaments/${editingId}` : '/admin/tournaments';
      await request(path, { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(form) });
      await queryClient.invalidateQueries({ queryKey: ['admin-tournaments'] });
      setShowEditor(false);
      setNotice({ type: 'ok', text: editingId ? 'Tournament configuration saved.' : 'Tournament created.' });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Could not save tournament.' });
    } finally {
      setBusy(false);
    }
  }

  async function start(id: string) {
    setBusy(true);
    try {
      const response = await request<{ format?: { message?: string } }>(`/admin/tournaments/${id}/start`, { method: 'POST', body: '{}' });
      await queryClient.invalidateQueries({ queryKey: ['admin-tournaments'] });
      setNotice({ type: 'ok', text: response.format?.message ?? 'Tournament started. Player registration is now locked to this format.' });
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Could not start tournament.' });
    } finally {
      setBusy(false);
    }
  }

  function scheduleRows(stage: StageId) {
    const items = stage === 'group'
      ? form.groupSchedule.filter(item => item.stage === stage)
      : form.knockoutSchedule.filter(item => item.stage === stage);
    return items.map(item => (
      <div key={item.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/15 p-2">
        <span className="w-16 text-xs text-white/50">Match {item.matchNumber}</span>
        <input
          type="datetime-local"
          value={toLocalInput(item.startsAt)}
          onChange={event => updateSchedule(stage, item.id, event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none"
        />
        <button onClick={() => removeSchedule(stage, item.id)} className="rounded-lg p-1.5 text-white/40 hover:bg-red-500/15 hover:text-red-300"><X size={14} /></button>
      </div>
    ));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-bold">Tournament operations</h3>
          <p className="mt-1 text-xs text-white/40">Configure format, stages, group rounds, and every scheduled match.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500"><Plus size={15} /> New tournament</button>
      </div>

      {notice && <div className={`rounded-xl border px-3 py-2 text-xs ${notice.type === 'ok' ? 'border-green-400/25 bg-green-500/10 text-green-200' : 'border-red-400/25 bg-red-500/10 text-red-200'}`}>{notice.text}</div>}
      {isError && <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">Could not load tournaments.</div>}

      {showEditor && (
        <div className="rounded-2xl border border-red-400/20 bg-[#1a1a22] p-4 lg:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div><h4 className="font-bold text-white">{editingId ? 'Edit tournament' : 'Create tournament'}</h4><p className="mt-1 text-xs text-white/40">All schedule times use your local time.</p></div>
            <button onClick={() => setShowEditor(false)} className="rounded-lg p-2 text-white/40 hover:bg-white/8"><X size={16} /></button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-white/50">Tournament name<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-red-400/50" /></label>
            <label className="text-xs text-white/50">Tournament type<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value as FormState['type'] })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"><option value="1v1">1 vs 1</option><option value="2v2">2 vs 2 Team</option></select></label>
            <label className="text-xs text-white/50">Group matches<input type="number" min={1} max={100} value={form.groupMatchCount} onChange={event => setForm({ ...form, groupMatchCount: Math.max(1, Number(event.target.value) || 1) })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-red-400/50" /></label>
            <label className="flex items-center gap-2 self-end rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-xs text-white/70"><input type="checkbox" checked={form.allowTeamRename} onChange={event => setForm({ ...form, allowTeamRename: event.target.checked })} /> Allow teams to rename themselves</label>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/50">Enabled stages</p>
            <div className="flex flex-wrap gap-2">
              {STAGES.map(stage => (
                <button key={stage.id} disabled={stage.id === 'group'} onClick={() => toggleStage(stage.id)} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${form.enabledStages.includes(stage.id) ? 'border-red-400/60 bg-red-500/20 text-red-200' : 'border-white/10 bg-white/5 text-white/35'} disabled:cursor-default`}>
                  {stage.label}{stage.id === 'group' ? ' (required)' : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
              <div className="mb-2 flex items-center justify-between"><div><h5 className="text-sm font-bold text-white">Group match schedule</h5><p className="text-[10px] text-white/35">Schedule each group round once.</p></div><button onClick={() => addSchedule('group')} className="flex items-center gap-1 rounded-lg bg-white/8 px-2 py-1.5 text-[10px] font-bold text-cyan-200"><CalendarClock size={13} /> Add round</button></div>
              <div className="space-y-2">{form.groupSchedule.length ? scheduleRows('group') : <p className="rounded-xl border border-dashed border-white/10 p-3 text-center text-xs text-white/30">No group rounds scheduled yet.</p>}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/15 p-3">
              <div className="mb-2 flex items-center justify-between"><div><h5 className="text-sm font-bold text-white">Knockout match schedule</h5><p className="text-[10px] text-white/35">Add each match individually.</p></div><span className="text-[10px] text-white/30">{knockoutStages.length} stages enabled</span></div>
              <div className="space-y-3">{knockoutStages.map(stage => <div key={stage}><div className="mb-1 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-white/45">{STAGES.find(item => item.id === stage)?.label}</span><button onClick={() => addSchedule(stage)} className="text-[10px] text-cyan-300">+ Add match</button></div>{scheduleRows(stage)}</div>)}</div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowEditor(false)} className="rounded-xl border border-white/10 px-4 py-2 text-xs text-white/60">Cancel</button><button disabled={busy} onClick={() => void save()} className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Save size={14} /> {busy ? 'Saving...' : 'Save configuration'}</button></div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/8 bg-[#1a1a22]">{['Name', 'Format', 'Registrations', 'Teams', 'Group matches', 'Status', 'Actions'].map(header => <th key={header} className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-white/40">{header}</th>)}</tr></thead>
            <tbody>
              {isLoading ? Array.from({ length: 4 }).map((_, index) => <tr key={index} className="border-b border-white/5"><td colSpan={7} className="px-4 py-4"><div className="h-3 w-full animate-pulse rounded bg-white/5" /></td></tr>) : tournaments.map(tournament => (
                <tr key={tournament.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="max-w-[190px] truncate px-4 py-3 font-medium text-white">{tournament.name}</td>
                  <td className="px-4 py-3 text-xs text-white/50">
                    <span className="block">{formatLabel(tournament)}</span>
                    <span className="text-[10px] text-white/25">{tournament.participantCount ?? tournament.registrations} entrants · {tournament.type === '2v2' ? 'teams' : 'players'}</span>
                  </td>
                  <td className="px-4 py-3 text-white/60">{tournament.registrations}</td>
                  <td className="px-4 py-3 text-white/60">{tournament.teams}</td>
                  <td className="px-4 py-3 text-white/60">{tournament.groupMatchCount}</td>
                  <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${tournament.status === 'running' ? 'bg-green-500/15 text-green-300' : tournament.status === 'open' ? 'bg-blue-500/15 text-blue-300' : 'bg-white/8 text-white/45'}`}>{tournament.status}</span></td>
                  <td className="px-4 py-3"><div className="flex gap-1"><button onClick={() => openEdit(tournament)} className="rounded-lg bg-white/8 px-2 py-1.5 text-[10px] text-white/70 hover:bg-white/15">Edit</button>{tournament.status === 'open' && <button disabled={busy} onClick={() => void start(tournament.id)} className="flex items-center gap-1 rounded-lg bg-green-500/15 px-2 py-1.5 text-[10px] text-green-300 hover:bg-green-500/25"><Play size={11} /> Start</button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))} className="rounded-lg p-2 text-white disabled:opacity-30 hover:bg-white/8"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-xs text-white/30">{Math.floor(offset / 20) + 1} / {Math.max(1, Math.ceil(total / 20))}</span>
        <button disabled={offset + 20 >= total} onClick={() => setOffset(value => value + 20)} className="rounded-lg p-2 text-white disabled:opacity-30 hover:bg-white/8"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}