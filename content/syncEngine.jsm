/*
    Password Tags, extension for Firefox 3.6+ and others
    Copyright (C) 2012  Daniel Dawson <ddawson@icehouse.net>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var EXPORTED_SYMBOLS = ["PasswordTagsEngine"];

const Cc = Components.classes,
      Ci = Components.interfaces,
      Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyGetter(
  this, "prefs", function ()
    Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).
    getBranch("extensions.passwordtags."));
XPCOMUtils.defineLazyGetter(
  this, "ussPref", function ()
    Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).
    getBranch("extensions.passwordtags.useSyncService"));
XPCOMUtils.defineLazyGetter(
  this, "syncPref", function ()
    Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).
    getBranch("services.sync.engine.passwordtags"));
XPCOMUtils.defineLazyServiceGetter(
  this, "consoleSvc",
  "@mozilla.org/consoleservice;1", "nsIConsoleService");
function log (aMsg) {
  if (!prefs.getBoolPref("logToConsole")) return;
  consoleSvc.logStringMessage("syncEngine: " + aMsg);
}

Cu.import("resource://services-sync/constants.js");
Cu.import("resource://services-sync/engines.js");
Cu.import("resource://services-sync/record.js");
Cu.import("resource://services-sync/util.js");
Cu.import("resource://passwordtags/signonMetadataStorage.jsm");

function PasswordTagsRecord (aCollection, aId) {
  CryptoWrapper.call(this, aCollection, aId);
}

PasswordTagsRecord.prototype = {
  __proto__: CryptoWrapper.prototype,
  _logName: "Record.PasswordTags",

  get guid () this.cleartext.id,
  set guid (aGUID) {
    this.cleartext.id = aGUID;
  },
};

Utils.deferGetSet(
  PasswordTagsRecord,
  "cleartext",
  ["hostname", "httpRealm", "formSubmitURL", "usernameHash",
   "tags", "metadata", "id"]);

function PasswordTagsStore (aName) {
  Store.call(this, aName);
}

PasswordTagsStore.prototype = {
  __proto__: Store.prototype,

  createRecord: function (aId, aCollection) {
    log("createRecord " + aId);
    var record = new PasswordTagsRecord(aCollection, aId);
    var mdspec = signonMetadataStorage.getMetadataByGUID(aId);
    if (mdspec) {
      for each (let name in ["hostname", "httpRealm", "formSubmitURL",
                             "usernameHash", "tags", "metadata", "guid"])
        record[name] = mdspec[name];
    } else
      record.deleted = true;
    return record;
  },

  itemExists: function (aId) {
    log("itemExists " + aId);
    var mdspec = signonMetadataStorage.getMetadataByGUID(aId);
    return Boolean(mdspec);
  },

  changeItemID: function (aOldID, aNewID) {
    log("changeItemID " + aOldID + " -> " + aNewID);
    var mdspec = signonMetadataStorage.getMetadataByGUID(aOldID);
    if (!mdspec) {
      this._log.trace("Can't change ID for nonexistent item");
      return;
    }

    if (!signonMetadataStorage.isOrphaned(mdspec)) {
      this._log.trace("Refusing to change ID for non-orphaned metadata");
      return;
    }

    signonMetadataStorage.changeMetadataGUID(aOldID, aNewID);
  },

  getAllIDs: function () {
    log("getAllIDs");
    return signonMetadataStorage.getAllMetadata();
  },

  wipe: function () {
    log("wipe");
    signonMetadataStorage.removeAllMetadata(true);
  },

  update: function (aRecord) {
    log("update " + aRecord.id);
    signonMetadataStorage.setMetadataFromRecord(aRecord);
  },

  remove: function (aRecord) {
    log("remove " + aRecord.id);
    signonMetadataStorage.removeMetadataByGUID(aRecord.guid);
  }
};

PasswordTagsStore.prototype.create = PasswordTagsStore.prototype.update;

function PasswordTagsTracker (aName, aStore) {
  Tracker.call(this, aName);
  this._store = aStore;
  Svc.Obs.add("weave:engine:start-tracking", this);
  Svc.Obs.add("weave:engine:stop-tracking", this);
}

PasswordTagsTracker.prototype = {
  __proto__: Tracker.prototype,

  _tracking: false,
  _enabled: false,
  _ignorePrefChange: false,

  enable: function () {
    log("Tracker enabling");
    if (this._tracking && !this._enabled) this._goAhead();
    this._enabled = true;
  },

  disable: function () {
    log("Tracker disabling");
    this._enabled = false;
    this._stop();
  },

  observe: function (aSubject, aTopic, aData) {
    switch (aTopic) {
    case "weave:engine:start-tracking":
      this._startTracking();
      break;

    case "weave:engine:stop-tracking":
      this._stopTracking();
      break;
    }
  },

  handleMetadataChange: function (aId) {
    log("Got metadata change");
    this.addChangedID(aId);
    this.score += SCORE_INCREMENT_MEDIUM;
  },

  handleMetadataChangeAllGUIDs: function () {
    log("Get metadata change for all GUIDs");
    var ids = Engines.get("passwordtags")._store.getAllIDs();
    for (let id in ids)
      this.addChangedID(id);
    this.score += SCORE_INCREMENT_XLARGE;
  },

  _startTracking: function () {
    log("Tracker now tracking");
    this._tracking = true;
    if (Engines.get("passwordtags").syncEnabled())
      this._goAhead();
    else
      this.disable();
  },

  _stopTracking: function () {
    log("Tracker no longer tracking");
    this._tracking = false;
    this._stop();
    Engines.get("passwordtags").syncDisabled();
  },

  _goAhead: function () {
    log("Tracker registering as metadata change listener");
    signonMetadataStorage.addMetadataChangeListener(this);
  },

  _stop: function () {
    log("Tracker unregistering as metadata change listener");
    signonMetadataStorage.removeMetadataChangeListener(this);
  },
};

function PasswordTagsEngine () {
  SyncEngine.call(this, "PasswordTags");
  if (ussPref.getBoolPref(""))
    this._tracker.enable();
  else
    this._tracker.disable();

  ussPref.QueryInterface(Ci.nsIPrefBranch2).addObserver("", this, true);
  syncPref.QueryInterface(Ci.nsIPrefBranch2).addObserver("", this, true);
}

PasswordTagsEngine.prototype = {
  __proto__: SyncEngine.prototype,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  _recordObj: PasswordTagsRecord,
  _storeObj: PasswordTagsStore,
  _trackerObj: PasswordTagsTracker,

  _ignorePrefChange: false,
  _syncEnabled: false,

  syncEnabled: function () {
    log("Sync is now enabled");
    this._syncEnabled = true;
    return this._updateSyncPref();
  },

  syncDisabled: function () {
    log("Sync is now disabled");
    this._syncEnabled = false;
  },

  observe: function (aSubject, aTopic, aData) {
    if (!this._ignorePrefChange && this._syncEnabled) {
      if (this._updateSyncPref())
        this._tracker.enable();
      else
        this._tracker.disable();
    } else
      this._ignorePrefChange = false;
  },

  _updateSyncPref: function () {
    var userChoice = ussPref.getBoolPref(""),
        syncPrefVal = syncPref.getBoolPref("");
    if (syncPrefVal != userChoice) {
      this._ignorePrefChange = true;
      syncPref.setBoolPref("", userChoice);
    }
    return userChoice;
  },
};

PasswordTagsEngine.register = function () {
  log("Registering self");
  syncPref.setBoolPref("", ussPref.getBoolPref(""));
  Engines.register(this);
}
