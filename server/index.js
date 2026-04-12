import { createAddon } from 'addon-sdk';

const addon = createAddon();

const MAX_ACTIVITY = 50;
const onlineWatched = new Map();

async function getWatchlist() {
    return (await addon.storage.get('watchlist')) || [];
}

async function getActivity() {
    return (await addon.storage.get('activity')) || [];
}

function wsPush(event, data) {
    try {
        addon.ws.push(event, data);
    } catch (_) { }
}

async function appendActivity(entry) {
    let activity = await getActivity();
    activity.unshift(entry);
    if (activity.length > MAX_ACTIVITY) activity = activity.slice(0, MAX_ACTIVITY);
    await addon.storage.set('activity', activity);
    wsPush('activity:new', entry);
}

addon.on('playerJoining', async (data) => {
    const watchlist = await getWatchlist();
    const watched = watchlist.find((e) => e.license === data.license);
    if (!watched) return;

    onlineWatched.set(data.license, { netid: data.netid, displayName: data.displayName || 'Unknown' });
    wsPush('presence:update', { license: data.license, isOnline: true, netid: data.netid });

    const alert = {
        type: 'join',
        timestamp: new Date().toISOString(),
        netid: data.netid,
        displayName: data.displayName || 'Unknown',
        license: data.license,
        watchReason: watched.reason || '',
    };

    addon.log.info(`[WATCHLIST] Watched player joined: ${alert.displayName} (${alert.license})`);

    await addon.players.addTag(data.netid, 'watched');
    await appendActivity(alert);
    wsPush('alert', alert);
});

addon.on('playerLeaving', async (data) => {
    if (!onlineWatched.has(data.license)) return;
    onlineWatched.delete(data.license);
    wsPush('presence:update', { license: data.license, isOnline: false });
});

addon.registerRoute('GET', '/watchlist', async (req) => {
    if (!req.admin.hasPermission('players.read')) {
        return { status: 403, body: { error: 'Requires players.read' } };
    }
    const watchlist = await getWatchlist();
    return { status: 200, body: { watchlist } };
});

addon.registerRoute('GET', '/watchlist/:license', async (req) => {
    if (!req.admin.hasPermission('players.read')) {
        return { status: 403, body: { error: 'Requires players.read' } };
    }
    const watchlist = await getWatchlist();
    const entry = watchlist.find((e) => e.license === req.params.license) || null;
    return { status: 200, body: { entry } };
});

addon.registerRoute('GET', '/watchlist/status', async (req) => {
    if (!req.admin.hasPermission('players.read')) {
        return { status: 403, body: { error: 'Requires players.read' } };
    }
    const watchlist = await getWatchlist();
    const statusList = watchlist.map((entry) => ({
        ...entry,
        isOnline: onlineWatched.has(entry.license),
        netid: onlineWatched.get(entry.license)?.netid ?? null,
    }));
    return { status: 200, body: { watchlist: statusList } };
});

addon.registerRoute('POST', '/watchlist', async (req) => {
    if (!req.admin.hasPermission('players.write')) {
        return { status: 403, body: { error: 'Requires players.write' } };
    }

    const { license, displayName, reason } = req.body || {};

    if (!license || typeof license !== 'string' || !license.trim()) {
        return { status: 400, body: { error: 'license is required' } };
    }

    const sanitizedLicense = license.trim();
    const sanitizedName = typeof displayName === 'string' ? displayName.trim().slice(0, 100) : 'Unknown';
    const sanitizedReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';

    const watchlist = await getWatchlist();

    if (watchlist.find((e) => e.license === sanitizedLicense)) {
        return { status: 409, body: { error: 'Player is already on the watchlist' } };
    }

    watchlist.push({
        license: sanitizedLicense,
        displayName: sanitizedName,
        reason: sanitizedReason,
        addedBy: req.admin.name,
        addedAt: new Date().toISOString(),
    });

    await addon.storage.set('watchlist', watchlist);
    addon.log.info(`[WATCHLIST] ${sanitizedLicense} added to watchlist by ${req.admin.name}`);
    wsPush('watchlist:updated', {});

    return { status: 200, body: { success: true } };
});

addon.registerRoute('DELETE', '/watchlist/:license', async (req) => {
    if (!req.admin.hasPermission('players.write')) {
        return { status: 403, body: { error: 'Requires players.write' } };
    }

    const watchlist = await getWatchlist();
    const idx = watchlist.findIndex((e) => e.license === req.params.license);

    if (idx === -1) {
        return { status: 404, body: { error: 'Player not found on watchlist' } };
    }

    const [removed] = watchlist.splice(idx, 1);
    await addon.storage.set('watchlist', watchlist);
    addon.log.info(`[WATCHLIST] ${req.params.license} removed from watchlist by ${req.admin.name}`);

    const presence = onlineWatched.get(req.params.license);
    if (presence) {
        await addon.players.removeTag(presence.netid, 'watched');
    }

    wsPush('watchlist:updated', {});
    return { status: 200, body: { success: true, removed } };
});

addon.registerRoute('GET', '/activity', async (req) => {
    if (!req.admin.hasPermission('players.read')) {
        return { status: 403, body: { error: 'Requires players.read' } };
    }
    const activity = await getActivity();
    return { status: 200, body: { activity } };
});

addon.registerRoute('DELETE', '/activity', async (req) => {
    if (!req.admin.hasPermission('all_permissions')) {
        return { status: 403, body: { error: 'Requires all_permissions' } };
    }
    await addon.storage.set('activity', []);
    addon.log.info(`[WATCHLIST] Activity log cleared by ${req.admin.name}`);
    return { status: 200, body: { success: true } };
});

addon.log.info('Player Watchlist addon loaded');
addon.ready();
