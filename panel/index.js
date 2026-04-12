const { createElement: h, useState, useEffect, useCallback, useRef } = React;

const ADDON_ID = 'addon-watchlist';
const ADDON_API = `/addons/${ADDON_ID}/api`;

function getHeaders() {
    const api = globalThis.txAddonApi;
    return api ? api.getHeaders() : { 'Content-Type': 'application/json' };
}

function useFetch(path) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const reload = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${ADDON_API}${path}`, { credentials: 'same-origin', headers: getHeaders() })
            .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then((d) => { setData(d); setLoading(false); })
            .catch((e) => { setError(e.message); setLoading(false); });
    }, [path]);

    useEffect(() => { reload(); }, [reload]);

    return { data, loading, error, reload };
}

async function apiPost(path, body) {
    const res = await fetch(`${ADDON_API}${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getHeaders(),
        body: JSON.stringify(body),
    });
    return res.json();
}

async function apiDelete(path) {
    const res = await fetch(`${ADDON_API}${path}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: getHeaders(),
    });
    return res.json();
}

function useAddonSocket(event, handler) {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const socketApi = globalThis.txAddonApi?.socket;
        if (!socketApi) return;
        const socket = socketApi.get();
        const eventName = `addon:${ADDON_ID}:${event}`;
        const cb = (data) => handlerRef.current(data);
        socket.on(eventName, cb);
        return () => socket.off(eventName, cb);
    }, [event]);
}

function AlertBanner({ alert, onDismiss }) {
    return h('div', {
        className: 'flex items-center gap-3 px-3 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/25 text-sm',
    },
        h('span', { className: 'w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0' }),
        h('div', { className: 'flex-1 min-w-0' },
            h('p', { className: 'font-medium text-foreground truncate' },
                alert.displayName),
            alert.watchReason && h('p', {
                className: 'text-xs text-muted-foreground truncate',
            }, alert.watchReason),
        ),
        h('span', { className: 'text-xs text-muted-foreground shrink-0' },
            new Date(alert.timestamp).toLocaleTimeString()),
        h('button', {
            onClick: onDismiss,
            className: 'shrink-0 ml-1 text-muted-foreground hover:text-foreground leading-none',
        }, '✕'),
    );
}

function WatchlistPage() {
    const list = useFetch('/watchlist');
    const activityFetch = useFetch('/activity');

    const [liveAlerts, setLiveAlerts] = useState([]);
    const [dismissed, setDismissed] = useState(new Set());

    const [message, setMessage] = useState(null);

    useAddonSocket('alert', (data) => {
        const id = `${Date.now()}-${Math.random()}`;
        setLiveAlerts((prev) => [{ ...data, _id: id }, ...prev]);
        setTimeout(() => setLiveAlerts((prev) => prev.filter((a) => a._id !== id)), 12000);
    });

    useAddonSocket('watchlist:updated', () => list.reload());
    useAddonSocket('activity:new', () => activityFetch.reload());

    const handleRemove = async (license) => {
        setMessage(null);
        try {
            const res = await apiDelete(`/watchlist/${encodeURIComponent(license)}`);
            if (res.success) {
                list.reload();
            } else {
                setMessage({ type: 'error', text: res.error || 'Failed to remove.' });
            }
        } catch (e) {
            setMessage({ type: 'error', text: e.message });
        }
    };

    const handleClearActivity = async () => {
        await apiDelete('/activity');
        activityFetch.reload();
    };

    const activeAlerts = liveAlerts.filter((a) => !dismissed.has(a._id));

    return h('div', { className: 'p-6 space-y-6 max-w-4xl' },

        h('div', null,
            h('h1', { className: 'text-2xl font-bold text-foreground' }, 'Player Watchlist'),
            h('p', { className: 'mt-1 text-sm text-muted-foreground' },
                'Monitor specific players. Staff are alerted in real-time when a watched player joins.'),
        ),

        activeAlerts.length > 0 && h('div', { className: 'space-y-2' },
            activeAlerts.map((alert) =>
                h(AlertBanner, {
                    key: alert._id,
                    alert,
                    onDismiss: () => setDismissed((prev) => new Set([...prev, alert._id])),
                })
            )
        ),

        message && h('div', {
            className: `p-3 rounded-lg text-sm border ${message.type === 'success'
                ? 'bg-green-500/15 text-green-400 border-green-500/30'
                : 'bg-red-500/15 text-red-400 border-red-500/30'}`,
        }, message.text),

        h('div', { className: 'rounded-lg border border-border bg-card p-6 space-y-4' },
            h('div', { className: 'flex items-center justify-between' },
                h('h2', { className: 'text-lg font-semibold text-foreground' },
                    list.data ? `Watchlist (${list.data.watchlist.length})` : 'Watchlist'),
                h('button', {
                    onClick: list.reload,
                    className: 'px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-accent',
                }, 'Refresh'),
            ),

            list.loading
                ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...')
                : list.error
                    ? h('p', { className: 'text-sm text-destructive' }, `Error: ${list.error}`)
                    : list.data?.watchlist?.length > 0
                        ? h('div', { className: 'divide-y divide-border -mx-2' },
                            list.data.watchlist.map((entry) =>
                                h('div', {
                                    key: entry.license,
                                    className: 'flex items-center gap-3 py-3 px-2 text-sm',
                                },
                                    h('div', { className: 'flex-1 min-w-0' },
                                        h('p', { className: 'font-medium text-foreground truncate' },
                                            entry.displayName || 'Unknown'),
                                        h('p', { className: 'text-xs text-muted-foreground' },
                                            entry.reason
                                                ? entry.reason
                                                : `Added by ${entry.addedBy} · ${new Date(entry.addedAt).toLocaleDateString()}`),
                                    ),
                                    h('button', {
                                        onClick: () => handleRemove(entry.license),
                                        className: 'shrink-0 text-xs text-muted-foreground hover:text-destructive',
                                    }, 'Remove'),
                                )
                            )
                        )
                        : h('p', { className: 'text-sm text-muted-foreground' },
                            'No players on the watchlist.'),
        ),

        h('div', { className: 'rounded-lg border border-border bg-card p-6 space-y-4' },
            h('div', { className: 'flex items-center justify-between' },
                h('h2', { className: 'text-lg font-semibold text-foreground' }, 'Recent Activity'),
                h('button', {
                    onClick: handleClearActivity,
                    className: 'px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-accent',
                }, 'Clear'),
            ),

            activityFetch.loading
                ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...')
                : activityFetch.data?.activity?.length > 0
                    ? h('div', { className: 'divide-y divide-border -mx-2 max-h-64 overflow-y-auto' },
                        activityFetch.data.activity.map((entry, i) =>
                            h('div', {
                                key: i,
                                className: 'flex items-center gap-3 py-2.5 px-2 text-sm',
                            },
                                h('span', { className: 'w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0' }),
                                h('div', { className: 'flex-1 min-w-0' },
                                    h('p', { className: 'font-medium text-foreground truncate' }, entry.displayName),
                                    entry.watchReason && h('p', {
                                        className: 'text-xs text-muted-foreground truncate',
                                    }, entry.watchReason),
                                ),
                                h('span', { className: 'text-xs text-muted-foreground whitespace-nowrap shrink-0' },
                                    new Date(entry.timestamp).toLocaleTimeString()),
                            )
                        )
                    )
                    : h('p', { className: 'text-sm text-muted-foreground' },
                        'No watched players have joined yet.'),
        ),
    );
}

function WatchlistPlayerModal({ license, displayName }) {
    const [entry, setEntry] = useState(undefined);
    const [fetchLoading, setFetchLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState(null);

    const loadEntry = useCallback(() => {
        if (!license) return;
        setFetchLoading(true);
        fetch(`${ADDON_API}/watchlist/${encodeURIComponent(license)}`, {
            credentials: 'same-origin',
            headers: getHeaders(),
        })
            .then((r) => r.json())
            .then((d) => { setEntry(d.entry ?? null); setFetchLoading(false); })
            .catch(() => { setEntry(null); setFetchLoading(false); });
    }, [license]);

    useEffect(() => { loadEntry(); }, [loadEntry]);
    useAddonSocket('watchlist:updated', loadEntry);

    const handleAdd = async () => {
        setSubmitting(true);
        setMessage(null);
        try {
            const res = await apiPost('/watchlist', {
                license,
                displayName: displayName || 'Unknown',
                reason: reason.trim(),
            });
            if (res.success) {
                setShowForm(false);
                setReason('');
                loadEntry();
            } else {
                setMessage(res.error || 'Failed to add.');
            }
        } catch (e) {
            setMessage(e.message);
        }
        setSubmitting(false);
    };

    const handleRemove = async () => {
        setMessage(null);
        try {
            const res = await apiDelete(`/watchlist/${encodeURIComponent(license)}`);
            if (res.success) {
                loadEntry();
            } else {
                setMessage(res.error || 'Failed to remove.');
            }
        } catch (e) {
            setMessage(e.message);
        }
    };

    if (!license) return null;

    if (fetchLoading) {
        return h('div', { className: 'p-3 text-xs text-muted-foreground' }, 'Loading watchlist status...');
    }

    return h('div', { className: 'p-3 space-y-3' },

        h('div', { className: 'flex items-center justify-between' },
            h('span', {
                className: `text-xs font-medium ${entry ? 'text-yellow-400' : 'text-muted-foreground'}`,
            }, entry ? 'On Watchlist' : 'Not Watched'),
            !entry && !showForm && h('button', {
                onClick: () => setShowForm(true),
                className: 'text-xs text-primary hover:underline',
            }, 'Add to watchlist'),
            entry && h('button', {
                onClick: handleRemove,
                className: 'text-xs text-muted-foreground hover:text-destructive',
            }, 'Remove'),
        ),

        entry && h('div', { className: 'text-xs text-muted-foreground space-y-0.5' },
            entry.reason && h('p', null, entry.reason),
            h('p', null, `Added by ${entry.addedBy} · ${new Date(entry.addedAt).toLocaleDateString()}`),
        ),

        showForm && !entry && h('div', { className: 'space-y-2' },
            h('input', {
                type: 'text',
                placeholder: 'Reason (optional)',
                value: reason,
                onChange: (e) => setReason(e.target.value),
                className: 'w-full rounded border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
            }),
            h('div', { className: 'flex gap-2' },
                h('button', {
                    onClick: handleAdd,
                    disabled: submitting,
                    className: 'px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50',
                }, submitting ? 'Adding...' : 'Confirm'),
                h('button', {
                    onClick: () => { setShowForm(false); setReason(''); setMessage(null); },
                    className: 'px-3 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground',
                }, 'Cancel'),
            ),
        ),

        message && h('p', { className: 'text-xs text-destructive' }, message),
    );
}

function WatchlistDashboardWidget() {
    const statusFetch = useFetch('/watchlist/status');
    const reloadRef = useRef(statusFetch.reload);
    reloadRef.current = statusFetch.reload;

    useAddonSocket('watchlist:updated', () => reloadRef.current());
    useAddonSocket('presence:update', () => reloadRef.current());

    const [liveAlerts, setLiveAlerts] = useState([]);
    const [dismissed, setDismissed] = useState(new Set());

    useAddonSocket('alert', (data) => {
        const id = `${Date.now()}-${Math.random()}`;
        setLiveAlerts((prev) => [{ ...data, _id: id }, ...prev.slice(0, 2)]);
        setTimeout(() => setLiveAlerts((prev) => prev.filter((a) => a._id !== id)), 12000);
    });

    const activeAlerts = liveAlerts.filter((a) => !dismissed.has(a._id));
    const watchlist = statusFetch.data?.watchlist ?? [];
    const onlineCount = watchlist.filter((e) => e.isOnline).length;

    return h('div', { className: 'p-4 space-y-3' },

        h('div', { className: 'flex items-center justify-between' },
            h('div', { className: 'flex items-center gap-2' },
                h('h3', { className: 'text-sm font-semibold text-foreground' }, 'Watched Players'),
                !statusFetch.loading && watchlist.length > 0 && h('span', {
                    className: 'text-xs px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25 font-medium',
                }, `${onlineCount} online`),
            ),
            h('button', {
                onClick: () => reloadRef.current(),
                className: 'text-xs text-muted-foreground hover:text-foreground',
            }, 'Refresh'),
        ),

        activeAlerts.length > 0 && h('div', { className: 'space-y-1.5' },
            activeAlerts.map((alert) =>
                h(AlertBanner, {
                    key: alert._id,
                    alert,
                    onDismiss: () => setDismissed((prev) => new Set([...prev, alert._id])),
                })
            )
        ),

        statusFetch.loading
            ? h('p', { className: 'text-xs text-muted-foreground' }, 'Loading...')
            : statusFetch.error
                ? h('p', { className: 'text-xs text-destructive' }, `Error: ${statusFetch.error}`)
                : watchlist.length > 0
                    ? h('div', { className: 'space-y-1.5 max-h-64 overflow-y-auto' },
                        [...watchlist]
                            .sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0))
                            .map((entry) =>
                                h('div', {
                                    key: entry.license,
                                    className: 'flex items-center gap-2.5 p-2 rounded bg-muted/50 text-xs',
                                },
                                    h('span', {
                                        className: `w-2 h-2 rounded-full shrink-0 ${entry.isOnline ? 'bg-green-400' : 'bg-zinc-500'}`,
                                    }),
                                    h('div', { className: 'flex-1 min-w-0' },
                                        h('p', { className: 'font-medium text-foreground truncate' },
                                            entry.displayName || 'Unknown'),
                                        entry.reason && h('p', {
                                            className: 'text-muted-foreground truncate',
                                        }, entry.reason),
                                    ),
                                    h('span', {
                                        className: `shrink-0 font-medium ${entry.isOnline ? 'text-green-400' : 'text-zinc-500'}`,
                                    }, entry.isOnline ? 'Online' : 'Offline'),
                                )
                            )
                    )
                    : h('p', { className: 'text-xs text-muted-foreground' },
                        'No players on the watchlist yet.'),
    );
}

export const pages = { WatchlistPage };
export const widgets = { WatchlistPlayerModal, WatchlistDashboardWidget };
