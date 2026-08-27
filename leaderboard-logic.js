(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  root.WT_LeaderboardLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clampInt(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  function compileNicknameRegex(source, flags) {
    const safeSource = String(source || '').trim();
    if (!safeSource) return null;
    const safeFlags = String(flags || '').trim();
    try {
      return new RegExp(safeSource, safeFlags);
    } catch (_) {
      return false;
    }
  }

  function normalizeRows(rows, limit) {
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => ({
        nickname: String(row?.nickname || '').trim(),
        scoreFP: clampInt(row?.scoreFP ?? row?.score_fp, 0, 9999)
      }))
      .filter((row) => row.nickname && row.scoreFP >= 0)
      .slice(0, Math.max(1, clampInt(limit, 1, 100)));
  }

  function mergeLocalPlayer(rows, localPlayer, limit) {
    const maxRows = Math.max(1, clampInt(limit, 1, 100));
    const base = Array.isArray(rows) ? rows.slice() : [];
    if (!localPlayer) return base.slice(0, maxRows);

    const localNickname = String(localPlayer?.nickname || '').trim();
    const filtered = base.filter(
      (row) => String(row?.nickname || '').trim() !== localNickname
    );
    filtered.push(localPlayer);
    filtered.sort((a, b) => {
      const scoreDiff =
        clampInt(b?.scoreFP, 0, 9999) - clampInt(a?.scoreFP, 0, 9999);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a?.nickname || '').localeCompare(String(b?.nickname || ''));
    });
    return filtered.slice(0, maxRows);
  }

  return {
    clampInt,
    compileNicknameRegex,
    normalizeRows,
    mergeLocalPlayer
  };
});
