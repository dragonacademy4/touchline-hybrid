import { useRef, useState } from 'preact/hooks';
import { activePlayers, cleanAliases, erasePlayer, groups, players, removePlayer, restorePlayer, savePlayer, settings, toast } from '../../data/store';
import type { Player } from '../../lib/types';
import { Empty, Sheet, Shell, initials } from '../components';
import { IconChevron, IconPlus, IconTrash } from '../icons';
import { href, navigate } from '../router';

export function Squad() {
  const [editing, setEditing] = useState<Player | 'new' | null>(null);
  const list = activePlayers.value;
  const byGroup = new Map<string, Player[]>();
  for (const p of list) byGroup.set(p.group || 'No group', [...(byGroup.get(p.group || 'No group') ?? []), p]);
  const archived = players.value.filter((p) => p.archived && !p.erased);

  return (
    <Shell title="Squad" actions={list.length > 0 ? <button class="icon-btn" type="button" aria-label="Add player" onClick={() => setEditing('new')}><IconPlus /></button> : undefined}>
      {list.length === 0 ? (
        <Empty title="No players yet" action={<button class="btn btn-primary btn-lg" type="button" onClick={() => setEditing('new')}><IconPlus /> Add a player</button>}>
          First names and nicknames are all Touchline needs. They never leave this phone.
        </Empty>
      ) : (
        <div class="stack narrow">
          {[...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([g, ps]) => (
            <section key={g} aria-labelledby={`g-${g}`}>
              <div class="section-head" style={{ marginTop: '8px' }}>
                <h2 id={`g-${g}`}>{g}</h2>
                <span class="small muted num">{ps.length} player{ps.length === 1 ? '' : 's'}</span>
              </div>
              <ul class="list">
                {ps.map((p) => (
                  <li key={p.id}>
                    <a class="list-row" href={href({ name: 'player', id: p.id })}>
                      <span class="avatar" aria-hidden="true">{initials(p.name)}</span>
                      <span class="grow">
                        <strong class="ellipsis" style={{ display: 'block' }}>{p.name}</strong>
                        <span class="small muted ellipsis" style={{ display: 'block' }}>
                          {p.aliases.length ? `Also: ${p.aliases.join(', ')}` : 'No nicknames'}
                        </span>
                      </span>
                      <span class="badge badge-cloud num" title="What the AI sees instead of the name">{p.token}</span>
                      <IconChevron class="chev" width={20} height={20} />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <button class="btn btn-secondary btn-block" type="button" onClick={() => setEditing('new')}><IconPlus /> Add a player</button>
          <p class="small muted">The blue code next to each name is what any AI sees instead of the name. The list linking codes to names stays on this phone.</p>
          {archived.length > 0 && (
            <details class="disclosure">
              <summary><IconChevron class="chev-r" /> Removed players ({archived.length})</summary>
              <ul class="list">
                {archived.map((p) => (
                  <li key={p.id} class="list-row" style={{ cursor: 'default' }}>
                    <span class="grow">{p.name} <span class="small muted">· {p.group}</span></span>
                    <button class="btn btn-ghost" type="button" onClick={() => restorePlayer(p)}>Restore</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {editing && <PlayerSheet player={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Shell>
  );
}

export function PlayerSheet({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const [name, setName] = useState(player?.name ?? '');
  const [aliases, setAliases] = useState(player?.aliases.join(', ') ?? '');
  const [group, setGroup] = useState(player?.group ?? groups.value[0] ?? '');
  const [error, setErrorState] = useState<{ field: 'name' | 'group'; msg: string } | null>(null);
  const setError = (msg: string | null, field: 'name' | 'group' = 'name') => setErrorState(msg ? { field, msg } : null);
  const surnameOk = useRef<string | null>(null);
  const keepAdding = useRef(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 2) return setError('Enter a name with at least 2 letters.');
    // "Sam B" is fine; "Zara O'Connor" looks like a surname. Warn once, then accept.
    const extra = n.split(/\s+/).slice(1).find((w) => w.replace(/[.'’-]/g, '').length >= 3);
    if (extra && surnameOk.current !== n) {
      surnameOk.current = n;
      return setError(`First names only, please. Is "${extra}" a surname? Use an initial instead, or save again to keep it.`);
    }
    if (!group.trim()) return setError('Enter a group, e.g. Under 9s.', 'group');
    const clash = activePlayers.value.find((p) => p.id !== player?.id && p.name.toLowerCase() === n.toLowerCase() && p.group === group.trim());
    if (clash) return setError(`There's already ${/^[aeiou]/i.test(clash.name) ? 'an' : 'a'} ${clash.name} in ${clash.group}. Add an initial, e.g. "${n} B".`);
    await savePlayer({ id: player?.id, name: n, aliases: cleanAliases(aliases), group });
    if (keepAdding.current) {
      toast(`${n} added.`);
      setName('');
      setAliases('');
      setError(null);
      keepAdding.current = false;
      (document.getElementById('pname') as HTMLInputElement | null)?.focus();
    } else onClose();
  };

  const [removing, setRemoving] = useState(false);
  const erase = async () => {
    if (!player) return;
    await erasePlayer(player.id);
    onClose();
    navigate({ name: 'squad' }, true);
    toast(`${player.name} and their notes have been erased.`);
  };
  const remove = async () => {
    if (!player) return;
    const result = await removePlayer(player.id);
    onClose();
    navigate({ name: 'squad' }, true);
    toast(result === 'archived' ? `${player.name} removed. Their past notes are kept.` : `${player.name} deleted.`, {
      label: 'Undo',
      run: () => (result === 'archived' ? restorePlayer(player) : savePlayer({ name: player.name, aliases: player.aliases, group: player.group })),
    }, 6000);
  };

  return (
    <Sheet title={player ? `Edit ${player.name}` : 'Add a player'} onClose={onClose}
      actions={<>
        {player && !removing && <button class="btn btn-danger" type="button" onClick={() => setRemoving(true)}><IconTrash /> Remove</button>}
        {!player && <button class="btn btn-secondary" style={{ flex: 1 }} type="submit" form="player-form" onClick={() => (keepAdding.current = true)}>Save + next</button>}
        <button class="btn btn-primary" style={{ flex: 1 }} type="submit" form="player-form" onClick={() => (keepAdding.current = false)}>Save</button>
      </>}>
      <form id="player-form" class="stack" onSubmit={submit} noValidate>
        <label class="field">
          <span>First name</span>
          <input id="pname" class="input" spellcheck={false} data-autofocus value={name} maxLength={40} autoComplete="off" autoCapitalize="words"
            onInput={(e) => { setName((e.target as HTMLInputElement).value); setError(null); }} aria-invalid={error?.field === 'name'} aria-describedby={error?.field === 'name' ? 'perr' : undefined} />
          {error?.field === 'name' && <span class="field-error" id="perr" role="alert">{error.msg}</span>}
          <span class="hint">First names only. Two with the same name? Add an initial, like "Sam B".</span>
        </label>
        <label class="field">
          <span>Nicknames <span class="muted" style={{ fontWeight: 400 }}>(optional)</span></span>
          <input class="input" spellcheck={false} value={aliases} maxLength={120} autoComplete="off" placeholder="e.g. Ollie, Ol" onInput={(e) => setAliases((e.target as HTMLInputElement).value)} />
          <span class="hint">Separate with commas. Nicknames are hidden from the AI too.</span>
        </label>
        <label class="field">
          <span>Group</span>
          <input class="input" list="group-list" value={group} maxLength={40} placeholder="e.g. Under 9s" onInput={(e) => { setGroup((e.target as HTMLInputElement).value); setError(null); }}
            aria-invalid={error?.field === 'group'} aria-describedby={error?.field === 'group' ? 'gerr' : undefined} />
          {error?.field === 'group' && <span class="field-error" id="gerr" role="alert">{error.msg}</span>}
          <datalist id="group-list">{groups.value.map((g) => <option key={g} value={g} />)}</datalist>
        </label>
        {player && removing && (
          <div class="card stack-sm" role="group" aria-label={`Remove ${player.name}`}>
            <p class="small"><strong>Remove {player.name}?</strong> Keep their past notes for your records, or erase everything about them from this phone{settings.value.syncEnabled ? ' and the backup' : ''}.</p>
            <div class="row wrap">
              <button class="btn btn-secondary" type="button" onClick={remove}>Remove, keep notes</button>
              <button class="btn btn-danger" type="button" onClick={erase}><IconTrash /> Erase their notes too</button>
            </div>
          </div>
        )}
        {player && <p class="small muted">Token <strong class="num">{player.token}</strong>: this is what any AI sees instead of {player.name}.</p>}
      </form>
    </Sheet>
  );
}
