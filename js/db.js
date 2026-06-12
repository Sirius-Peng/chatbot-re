'use strict';
(function() {
    try {
        if (typeof Dexie !== 'undefined') {
            var db = new Dexie('ChuanXunDB');
            db.version(1).stores({
                messages: '++id,sessionId,timestamp',
                settings: 'key',
                templates: '++id,name'
            });
            db.version(2).stores({
                messages: '++id,sessionId,timestamp',
                settings: 'key',
                templates: '++id,name',
                audioFiles: '++id,name,createdAt'
            });
            window.ChuanXunDB = db;
            console.log('[DB] Dexie.js initialized successfully');
        } else {
            console.warn('[DB] Dexie.js not available, falling back to localforage');
            window.ChuanXunDB = null;
        }
    } catch(e) {
        console.warn('[DB] Dexie initialization failed:', e.message);
        window.ChuanXunDB = null;
    }
})();
