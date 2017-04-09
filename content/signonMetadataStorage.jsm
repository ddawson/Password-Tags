/*
    Password Tags, extension for Firefox and others
    Copyright (C) 2017  Daniel Dawson <danielcdawson@gmail.com>

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

"use strict";

var EXPORTED_SYMBOLS = ["SignonMetadata", "signonMetadataStorage"];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
const MD_DBFILENAME = "signons.sqlite",
      MD_FILENAME = "passwordtags.json";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyServiceGetter(
  this, "os", "@mozilla.org/observer-service;1", "nsIObserverService");
XPCOMUtils.defineLazyGetter(
  this, "encoder",
  () => new TextEncoder("UTF-8"));
XPCOMUtils.defineLazyGetter(
  this, "rand",
  () => Cc["@mozilla.org/security/random-generator;1"].
        createInstance(Ci.nsIRandomGenerator));
XPCOMUtils.defineLazyGetter(
  this, "ch",
  () => Cc["@mozilla.org/security/hash;1"].
        createInstance(Ci.nsICryptoHash));
XPCOMUtils.defineLazyGetter(
  this, "prefs",
  () => Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).
        getBranch("extensions.passwordtags.").
        QueryInterface(Ci.nsIPrefBranch2));
XPCOMUtils.defineLazyGetter(
  this, "strings",
  () => Cc["@mozilla.org/intl/stringbundle;1"].
        getService(Ci.nsIStringBundleService).
        createBundle(
          "chrome://passwordtags/locale/defaultFieldConfig.properties"));
XPCOMUtils.defineLazyServiceGetter(
  this, "loginMgr",
  "@mozilla.org/login-manager;1", "nsILoginManager");
XPCOMUtils.defineLazyServiceGetter(
  this, "loginMgrCrypto",
  "@mozilla.org/login-manager/crypto/SDR;1", "nsILoginManagerCrypto");
XPCOMUtils.defineLazyServiceGetter(
  this, "storageSvc",
  "@mozilla.org/storage/service;1", "mozIStorageService");
XPCOMUtils.defineLazyServiceGetter(
  this, "uuidGen",
  "@mozilla.org/uuid-generator;1", "nsIUUIDGenerator");
XPCOMUtils.defineLazyServiceGetter(
  this, "consoleSvc",
  "@mozilla.org/consoleservice;1", "nsIConsoleService");
function log (aMsg) {
  if (!prefs.getBoolPref("logToConsole")) return;
  consoleSvc.logStringMessage(aMsg);
}


const COMMA_CHARS =
  ",\u055d\u060c\u07f8\u1363\u3001\ua60d\ufe50\ufe51\uff0c\uff64";

var escape = (aRawStr) =>
  aRawStr.replace(/=/g, "==")
         .replace(/\|/g, "=/")
         .replace(/:/g, "=;");

var unescape = (aEStr) =>
  aEStr.replace(/=;/g, ":")
       .replace(/=\//g, "|")
       .replace(/==/g, "=");

function SignonMetadata () {
  this.tags = "";
  this.metadata = [];
  this.metadataType = -1;
}

SignonMetadata.prototype = {
  serializeMetadata: function () {
    var str = "";

    for (let i = 0; i < this.metadata.length; i++) {
      let obj = this.metadata[i];
      let name = obj.name, type = obj.type, value = obj.value;
      let eName = escape(name),
          eValue = escape(value);
      if (str !== "") str += "|";
      str += eName + ":" + type + ":" + eValue;
    }

    return str;
  },

  setMetadataFromString: function (aSerialString) {
    this.metadata = [];
    var fieldStrs = aSerialString.split("|");

    for (let i = 0; i < fieldStrs.length; i++) {
      let eParts = fieldStrs[i].split(":");
      let name = unescape(eParts[0]), value = unescape(eParts[2]);
      this.metadata.push({ name: name, type: eParts[1], value: value });
    }
  },

  insertField: function (aIdx, aName, aType, aValue) {
    if (aIdx > this.metadata.length || aIdx < -1)
      throw "Index out of range";

    if (aIdx == -1) aIdx = this.metadata.length;
    this.metadata.splice(aIdx, 0,
                         { name: aName, type: aType, value: aValue });
  },

  removeField: function (aIdx) {
    if (aIdx >= this.metadata.length || aIdx < 0)
      throw "Index out of range";

    return this.metadata.splice(aIdx, 1)[0];
  },

  getField: function (aIdx) {
    if (aIdx >= this.metadata.length || aIdx < 0)
      throw "Index out of range";
  
    return this.metadata[aIdx];
  },
};

var signonMetadataStorage = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  _metadataChangeListeners: [],
  _defaultChangeListeners: [],

  getMetadata: function (aSignon) {
    var mdspec = this._getMetadataRaw(aSignon);
    var obj = new SignonMetadata();
    var metadataStr = null;
    obj.metadataType = -1;

    if (mdspec) {
      obj.tags = mdspec.tags;
      if (mdspec.metadata)
        [metadataStr, obj.metadataType] =
          this._decryptMetadata(mdspec.metadata);
    }

    if (metadataStr)
      obj.setMetadataFromString(metadataStr);
    else {
      let defaults = this.getDefaults();
      for (let i = 0; i < defaults.length; i++)
        obj.insertField(-1, defaults[i].name, defaults[i].type,
                        defaults[i].type == "number" ? "0" : "");
    }

    return obj;
  },

  getMetadataByGUID: function (aGUID) {
    var mdspec = this._getMetadataRawByGUID(aGUID);
    if (mdspec && mdspec.metadata)
      [mdspec.metadata, mdspec.metadataType] =
        this._decryptMetadata(mdspec.metadata);

    return mdspec;
  },

  _decryptMetadata: function (aRaw) {
    if (!aRaw) return ["", -1];
    var match = aRaw.match(/^([0-9]+)\|([\s\S]*)$/);
    if (!match) return [aRaw, 0];
    var [type, encoded] = [match[1], match[2]];

    if (type == 0)
      return [encoded, 0];
    else if (type == 1) try {
      let decoded = loginMgrCrypto.decrypt(encoded);
      return [decoded, 1];
    } catch (e) {
      return ["", -1];
    }
  },

  getMetadataRaw: function (aSignon) {
    return this._getMetadataRaw(aSignon);
  },

  getAllMetadata: function () {
    var allMetadataArray = this._getAllMetadata();

    var allMetadataObj = {};
    for (let i = 0; i < allMetadataArray.length; i++) {
      let item = allMetadataArray[i];
      allMetadataObj[item.guid] = item;
    }

    return allMetadataObj;
  },

  getTags: function (aSignon) {
    var mdspec = this._getMetadataRaw(aSignon);
    if (!mdspec)
      return "";
    else
      return mdspec.tags;
  },

  setMetadata: function (aSignon, aSignonMeta) {
    var tags = this._normalizeTags(aSignonMeta.tags);
    var metaStr = aSignonMeta.serializeMetadata();
    if (metaStr == "")
      metaStr = null;
    else if (aSignonMeta.metadataType == 0)
      metaStr = "0|" + metaStr;
    else if (aSignonMeta.metadataType == 1)
      metaStr = this._encryptMetadata(metaStr);
    this._setMetadataRaw(aSignon, tags, metaStr);
  },

  setMetadataFromRecord: function (aMDSpec) {
    if (parseInt(aMDSpec.metadataType) == 1)
      aMDSpec.metadata = this._encryptMetadata(aMDSpec.metadata);
    else
      aMDSpec.metadata = "0|" + aMDSpec.metadata;

    this._setMetadataRawFromRecord(aMDSpec);
  },

  _encryptMetadata: function (aPlaintext) {
    return "1|" + loginMgrCrypto.encrypt(aPlaintext);
  },

  changeMetadataGUID: function (aOldGUID, aNewGUID) {
    this._changeGUID(aOldGUID, aNewGUID, true);
  },

  setTags: function (aSignon, aTags) {
    aTags = this._normalizeTags(aTags);
    this._setMetadataRaw(aSignon, aTags);
  },

  _normalizeTags: function (aTags) {
    for (let ch of COMMA_CHARS)
      aTags = aTags.replace(ch, ",", "g");
    let tagsAry = aTags.split(",").map(str => str.trim());
    tagsAry.sort();
    let prevString = null;
    let i = 0;
    while (i < tagsAry.length) {
      let str = tagsAry[i];
      if (str == prevString)
        tagsAry.splice(i, 1);
      else {
        prevString = str;
        i++;
      }
    }
    return tagsAry.join(",");
  },

  removeMetadata: function (aSignon) {
    this._removeMetadataByGUID(aSignon.guid, false);
  },

  removeOrphanedMetadata: function () {
    var allMetadata = this._getAllMetadata();

    for (let i = 0; i < allMetadata.length; i++) {
      let mdSpec = allMetadata[i];
      if (this.isOrphaned(mdSpec))
        this._removeMetadataByGUID(mdSpec.guid, false);
    }
  },

  isOrphaned: function (aMDSpec) {
    var res = loginMgr.findLogins({}, aMDSpec.hostname, aMDSpec.formSubmitURL,
                                  aMDSpec.httpRealm);
    var [ver, salt, hash] = this._parseSaltedHash(aMDSpec.usernameHash);
    for (let i = 0; i < res.length; i++) {
      let signon = res[i];
      if (aMDSpec.usernameHash == this._hash(signon.username, ver, salt))
        return false;
    }

    return true;
  },

  removeMetadataByGUID: function (aGUID) {
    this._removeMetadataByGUID(aGUID, true);
  },

  removeAllMetadata: function (aFromSync) {
    this._removeAllMetadata(aFromSync);
  },

  addMetadataChangeListener: function (aListener) {
    if (this._metadataChangeListeners.indexOf(aListener) == -1)
      this._metadataChangeListeners.push(aListener);
  },

  removeMetadataChangeListener: function (aListener) {
    for (var i = 0; i < this._metadataChangeListeners.length; i++)
      if (aListener == this._metadataChangeListeners[i]) {
        this._metadataChangeListeners.splice(i, 1);
        return;
      }
  },

  notifyMetadataChangeListeners: function (aGUID) {
    for (var i = 0; i < this._metadataChangeListeners.length; i++)
      try {
        this._metadataChangeListeners[i].handleMetadataChange(aGUID);
      } catch (e) {}
  },

  notifyMetadataChangeListenersAllGUIDs: function () {
    for (var i = 0; i < this._metadataChangeListeners.length; i++)
      try {
        this._metadataChangeListeners[i].handleMetadataChangeAllGUIDs();
      } catch (e) {}
  },

  getNumberOfDefaultFields: function () {
    if (!this._defaults) this._readDefaultFields();
    return this._defaults.length;
  },

  insertDefaultField: function (aIdx, aName, aType) {
    if (aIdx > this._defaults.length || aIdx < -1)
      throw "Index out of range";

    if (aIdx == -1) aIdx = this._defaults.length;
    this._defaults.splice(aIdx, 0, { name: aName, type: aType });
    this._writeDefaultFields();
  },

  removeDefaultField: function (aIdx) {
    if (aIdx >= this._defaults.length || aIdx < 0)
      throw "Index out of range";

    var fld = this._defaults.splice(aIdx, 1)[0];
    this._writeDefaultFields();
    return fld;
  },

  moveDefaultField: function (aOldIdx, aNewIdx) {
    if (aOldIdx < 0 || aOldIdx >= this._defaults.length
        || aNewIdx < 0 || aNewIdx >= this._defaults.length)
      throw "Index out of range";

    var fld = this._defaults.splice(aOldIdx, 1)[0];
    this._defaults.splice(aNewIdx, 0, fld);
    this._writeDefaultFields();
  },

  replaceDefaultField: function (aIdx, aName, aType) {
    if (aIdx < 0 || aIdx >= this._defaults.length)
      throw "Index out of range";

    this._defaults[aIdx] = { name: aName, type: aType };
    this._writeDefaultFields();
  },

  setDefaults: function (aDefaults) {
    this._defaults = aDefaults;
    this._writeDefaultFields();
  },

  getDefaultField: function (aIdx) {
    if (aIdx >= this._defaults.length || aIdx < 0)
      throw "Index out of range";
    if (!this._defaults) this._readDefaultFields();

    return this._defaults[aIdx];
  },

  getDefaults: function () {
    if (!this._defaults) this._readDefaultFields();
    return this._defaults;
  },

  addDefaultChangeListener: function (aListener) {
    if (this._defaultChangeListeners.length == 0)
      prefs.addObserver("defaultFields", this, true)
    this._defaultChangeListeners.push(aListener);
  },

  removeDefaultChangeListener: function (aListener) {
    for (var i = 0; i < this._defaultChangeListeners.length; i++)
      if (this._defaultChangeListeners[i] === aListener) {
        this._defaultChangeListeners.splice(i, 1);
        break;
      }

    if (this._defaultChangeListeners.length == 0)
      prefs.removeObserver("defaultFields", this);
  },

  observe: function (aSubject, aTopic, aData) {
    switch (aTopic) {
    case "nsPref:changed":
      // For now, only the one pref is being observed.
      this._readDefaultFields();
      for (let i = 0; i < this._defaultChangeListeners.length; i++)
        try {
          this._defaultChangeListeners[i].handleDefaultChange();
        } catch (e) {}
      break;

    case "passwordmgr-storage-changed":
      if (aData == "modifyLogin") {
        let oldLogin = aSubject.QueryInterface(Ci.nsIArray).
                       queryElementAt(0, Ci.nsILoginInfo),
            newLogin = aSubject.QueryInterface(Ci.nsIArray).
                       queryElementAt(1, Ci.nsILoginInfo);
        if (oldLogin.hostname == newLogin.hostname
            && oldLogin.httpRealm == newLogin.httpRealm
            && oldLogin.formSubmitURL == newLogin.formSubmitURL
            && oldLogin.username == newLogin.username)
          return;

        this._rekeyMetadata(oldLogin, newLogin);
      } else if (aData == "removeLogin"
                 && !prefs.getBoolPref("keepMetadataForDeletedLogins"))
        this.removeMetadata(aSubject.QueryInterface(Ci.nsILoginMetaInfo));
      else if (aData == "removeAllLogins"
                 && !prefs.getBoolPref("keepMetadataForDeletedLogins"))
        this._deleteAllRows(false);
      break;
    }
  },

  _getMetadataRaw: function (aSignon) {
    if (!this._loaded) this._init();
    aSignon.QueryInterface(Ci.nsILoginMetaInfo);

    var guid = aSignon.guid;
    var mdspec = this._findMetadata(guid);
    if (mdspec && mdspec.hashVersion >= 2) return mdspec;

    mdspec = this._findMetadataByData(aSignon);
    if (!mdspec) return null;

    this._changeGUID(mdspec.guid, guid, false);
    mdspec.guid = guid;
    return mdspec;
  },

  _getMetadataRawByGUID: function (aGUID) {
    if (!this._loaded) this._init();
    return this._findMetadata(aGUID);
  },

  _setMetadataRaw: function (aSignon, aTags, aMetadata) {
    if (!this._loaded) this._init();
    aSignon.QueryInterface(Ci.nsILoginMetaInfo);

    var guid = aSignon.guid;

    if (!aTags && !aMetadata && aMetadata !== undefined)
      this._deleteRow(guid, false);
    else {
      let mdSpec = this._findMetadata(guid);
      if (mdSpec) {
        mdSpec.tags = aTags;
        if (aMetadata !== undefined) mdSpec.metadata = aMetadata;
        this._updateRow(guid, mdSpec, false);
      } else {
        mdSpec = {
          hostname: aSignon.hostname, httpRealm: aSignon.httpRealm,
          formSubmitURL: aSignon.formSubmitURL,
          usernameHash: this._hash(aSignon.username),
          tags: aTags, metadata: aMetadata || null, guid: guid };
        this._addRow(mdSpec, false);
      }
    }
  },

  _setMetadataRawFromRecord: function (aMDSpec) {
    if (!this._loaded) this._init();

    if (this._findMetadata(aMDSpec.guid))
      this._updateRow(aMDSpec.guid, aMDSpec, true);
    else
      this._addRow(aMDSpec, true);
  },

  _rekeyMetadata: function (aOldSignon, aNewSignon) {
    if (!this._loaded) this._init();

    var mdspec = this._getMetadataRaw(aOldSignon);
    if (mdspec) {
      mdspec.hostname = aNewSignon.hostname;
      mdspec.httpRealm = aNewSignon.httpRealm;
      mdspec.formSubmitURL = aNewSignon.formSubmitURL;
      mdspec.usernameHash = this._hash(aNewSignon.username);
      this._updateRow(mdspec.guid, mdspec, false);
    }
  },

  _removeMetadataByGUID: function (aGUID, aFromSync) {
    if (!this._loaded) this._init();
    this._deleteRow(aGUID, aFromSync);
  },

  _removeAllMetadata: function (aFromSync) {
    if (!this._loaded) this._init();
    this._deleteAllRows(aFromSync);
  },

  _findMetadata: function (aGUID) {
    var cMDSpec = this._byGUID[aGUID];
    if (cMDSpec) {
      let mdSpec = {};
      for (let propname of ["hostname", "httpRealm", "formSubmitURL",
                            "usernameHash", "tags", "metadata", "guid"])
        mdSpec[propname] = cMDSpec[propname];
      let [ver, salt, hash] = this._parseSaltedHash(mdSpec.usernameHash);
      mdSpec.hashVersion = ver;
      return mdSpec;
    } else
      return null;
  },

  _findMetadataByData: function (aSignon) {
    var candidates = Object.values(this._searchCacheForData(aSignon));

    for (let cand of candidates) {
      let saltedHash = cand.usernameHash,
          [ver, salt, hash] = this._parseSaltedHash(saltedHash);
      if (saltedHash == this._hash(aSignon.username, ver, salt)) {
        let mdSpec = {};
        for (let propname of ["hostname", "httpRealm", "formSubmitURL",
                              "usernameHash", "tags", "metadata", "guid"])
          mdSpec[propname] = cand[propname];

        // Migrate to salted hash if necessary.
        if (ver < 2) {
          mdSpec.usernameHash = this._hash(aSignon.username);
          this._updateRow(mdSpec.guid, mdSpec, false);
        }

        return mdSpec;
      }
    }

    return null;
  },

  _getAllMetadata: function () {
    if (!this._loaded) this._init();

    var list = [];
    for (let cMDSpec of this._byGUID) {
      let mdSpec = {}
      for (let propname of ["hostname", "httpRealm", "formSubmitURL",
                            "usernameHash", "tags", "metadata", "guid"])
        mdSpec[propname] = cMDSpec[propname];
      list.push(mdSpec);
    }
    return list;
  },

  _addRow: function (aMDSpec, aFromSync) {
    var propnameList = ["hostname", "httpRealm", "formSubmitURL",
                        "usernameHash", "tags", "metadata", "guid"];
    var cMDSpec = {};
    for (let propname of propnameList)
      cMDSpec[propname] = aMDSpec[propname];
    this._updateCache(cMDSpec);
    this._writeCache();
  },

  _updateRow: function (aGUID, aMDSpec, aFromSync) {
    var cMDSpec = {};
    for (let propname of ["hostname", "httpRealm", "formSubmitURL",
                          "usernameHash", "tags", "metadata", "guid"])
      cMDSpec[propname] = aMDSpec[propname];
    this._removeFromCache(cMDSpec, aGUID);
    this._updateCache(cMDSpec);
    this._writeCache();
  },

  _changeGUID: function (aOldGUID, aNewGUID, aFromSync) {
    var mdSpec = this._byGUID[aOldGUID];
    if (!mdSpec) return;
    this._removeFromCache(mdSpec);
    mdSpec.guid = aNewGUID;
    this._updateCache(mdSpec);
    this._writeCache();
  },

  _deleteRow: function (aGUID, aFromSync) {
    var mdSpec = this._byGUID[aGUID];
    if (!mdSpec) return;
    this._removeFromCache(mdSpec, aGUID);
    this._writeCache();
  },

  _deleteAllRows: function (aFromSync) {
    this._byGUID = {};
    this._byData_realm = {};
    this._byData_submit = {};
    this._writeCache();
  },

  _init: function () {
    this._byGUID = {};
    this._byData_realm = {};
    this._byData_submit = {};

    if (!this._readMDFile()) {
      // Try to migrate from SQLite if JSON file not present
      this._migrateSQLite();
    }

    this._loaded = true;
  },

  _readMDFile: function () {
    if (!this._jsonFile.exists()) return false;

    var fstream = Cc["@mozilla.org/network/file-input-stream;1"]
      .createInstance(Ci.nsIFileInputStream);
    var cstream = Cc["@mozilla.org/intl/converter-input-stream;1"]
      .createInstance(Ci.nsIConverterInputStream);
    fstream.init(this._jsonFile, -1, -1, 0);
    cstream.init(fstream, "UTF-8", -1,
                 Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
    var contents = "", str = {};
    while (cstream.readString(4096, str) != 0)
      contents += str.value;
    cstream.close();
    fstream.close();

    var obj = JSON.parse(contents);

    if (obj.version != 3) {
      log("Unrecognized version of JSON metadata");
      return true;
    }

    var { metadata } = obj;

    for (let i = 0; i < metadata.length; i++)
      this._updateCache(metadata[i]);
  },

  _writeCache: function () {
    var obj = { version: 3, metadata: Object.values(this._byGUID) };
    var encoded = JSON.stringify(obj) + "\n";

    var fstream = Cc["@mozilla.org/network/file-output-stream;1"]
      .createInstance(Ci.nsIFileOutputStream);
    var cstream = Cc["@mozilla.org/intl/converter-output-stream;1"]
      .createInstance(Ci.nsIConverterOutputStream);
    fstream.init(this._jsonFile, -1, -1, 0);
    cstream.init(fstream, "UTF-8", -1,
                 Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
    cstream.writeString(encoded);
    cstream.close();
    fstream.close();
  },

  _migrateSQLite: function () {
    try {
      if (!this._dbFile.exists()) return;
      let dbConn = storageSvc.openDatabase(this._dbFile);
      if (!dbConn.tableExists("dd_passwordtags_metadata")) return;

      let stmt = dbConn.createStatement(
        "SELECT * FROM dd_passwordtags_metadata");

      while (stmt.executeStep()) {
        let mdSpec = {
          hostname: stmt.row.hostname,
          httpRealm: stmt.row.httpRealm,
          formSubmitURL: stmt.row.formSubmitURL,
          usernameHash: stmt.row.usernameHash,
          tags: stmt.row.tags,
          metadata: stmt.row.metadata,
          guid: stmt.row.guid };
        this._updateCache(mdSpec);
      }

      stmt.finalize();
      this._writeCache();

      dbConn.executeSimpleSQL("DROP TABLE dd_passwordtags_metadata");
    } catch (e) {
      log("Reading database failed with exception " + e);
    }
  },

  _updateCache: function (aMDSpec) {
    var { hostname, httpRealm, formSubmitURL, guid } = aMDSpec;
    this._byGUID[guid] = aMDSpec;

    if (httpRealm) {
      let byHostname = this._byData_realm[hostname];
      if (!byHostname)
        byHostname = this._byData_realm[hostname] = {};
      let byRealm = byHostname[httpRealm];
      if (!byRealm)
        byRealm = byHostname[httpRealm] = {};
      byRealm[guid] = aMDSpec;
    } else {
      let byHostname = this._byData_submit[hostname];
      if (!byHostname)
        byHostname = this._byData_submit[hostname] = {};
      let bySubmit = byHostname[formSubmitURL];
      if (!bySubmit)
        bySubmit = byHostname[formSubmitURL] = {};
      bySubmit[guid] = aMDSpec;
    }
  },

  _searchCacheForData: function (aSignon) {
    var { hostname, httpRealm, formSubmitURL } = aSignon;

    if (httpRealm) {
      let byHostname = this._byData_realm[hostname];
      if (byHostname) {
        let byRealm = byHostname[httpRealm];
        if (byRealm) return byRealm;
      }
    } else {
      let byHostname = this._byData_submit[hostname];
      if (byHostname) {
        let bySubmit = byHostname[formSubmitURL];
        if (bySubmit) return bySubmit;
      }
    }

    return [];
  },

  _removeFromCache: function (aMDSpec, aOldGUID) {
    if (!aMDSpec) return;

    var { hostname, httpRealm, formSubmitURL, guid } = aMDSpec;

    if (aOldGUID)
      delete this._byGUID[aOldGUID];
    else
      delete this._byGUID[guid];

    if (httpRealm) {
      let byHostname = this._byData_realm[hostname],
          byRealm = byHostname[httpRealm];
      if (aOldGUID)
        delete byRealm[aOldGUID];
      else
        delete byRealm[guid]
      if (!byRealm) {
        delete byHostname[httpRealm];
        if (!byHostname) delete this._byData_realm[hostname];
      }
    } else {
      let byHostname = this._byData_submit[hostname],
          bySubmit = byHostname[formSubmitURL];
      if (aOldGUID)
        delete bySubmit[aOldGUID];
      else
        delete bySubmit[guid];
      if (!bySubmit) {
        delete byHostname[formSubmitURL];
        if (!byHostname) delete this._byData_submit[hostname];
      }
    }
  },

  _parseSaltedHash: function (aSalted) {
    if (aSalted.substr(0, 2) != "2|") return [1, "", aSalted];
    var [ver, salt, hash] = aSalted.split("|");
    ver = parseInt(ver);
    return [ver, salt, hash];
  },

  _hash: function (aPlain, aVer, aSalt) {
    var ver = aVer || 2;
    var salt = ver < 2 ? "" : aSalt || this._generateSalt();
    var composite = salt + aPlain;
    var bytes = encoder.encode(composite);
    ch.init(ch.MD5);
    ch.update(bytes, bytes.length);
    var hash = ch.finish(true);
    if (ver >= 2)
      return "2" + "|" + salt + "|" + hash;
    else
      return hash;
  },

  _generateSalt: function () {
    const num_blocks = 3; // Generate 9 bytes
    var bytes = rand.generateRandomBytes(num_blocks*3);

    // Implementing base64 encoding, because btoa() is stupid, expecting
    // the standard String type which doesn't represent arbitrary byte
    // sequences because it's Unicode.
    //
    // This is only for multiples of 3 bytes, for simplicity.
    const a =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var output = "";

    for (let i = 0; i < num_blocks; i++) {
      let ib = bytes.slice(i*3, i*3+3);
      let ob = a[ib[0]>>2] + a[((ib[0]&3)<<4)|(ib[1]>>4)] +
               a[((ib[1]&0xf)<<2)|(ib[2]>>6)] + a[ib[2]&0x3f];
      output += ob;
    }

    return output;
  },

  _readDefaultFields: function () {
    if (!prefs.prefHasUserValue("defaultFields")) {
      this._resetDefaults();
      return;
    }

    var serialString = prefs.getComplexValue("defaultFields",
                                             Ci.nsISupportsString).data;
    this._defaults = new Array();
    if (serialString == "") return;
    var fieldStrs = serialString.split("|");

    for (let i = 0; i < fieldStrs.length; i++) {
      let eParts = fieldStrs[i].split(":");
      let name = unescape(eParts[0]);
      let type = eParts[1] ? eParts[1] : "text";
      this._defaults.push({ name: name, type: type });
    }
  },

  _writeDefaultFields: function () {
    var str = "";

    for (let i = 0; i < this._defaults.length; i++) {
      let obj = this._defaults[i];
      let name = obj.name, type = obj.type;
      let eName = escape(name);
      if (str !== "") str += "|";
      str += eName + ":" + type;
    }

    let sStr = Cc["@mozilla.org/supports-string;1"].
               createInstance(Ci.nsISupportsString);
    sStr.data = str;
    prefs.setComplexValue("defaultFields", Ci.nsISupportsString, sStr);
  },

  _resetDefaults: function () {
    var defName =
      Cc["@mozilla.org/intl/stringbundle;1"].
      getService(Ci.nsIStringBundleService).
      createBundle(
        "chrome://passwordtags/locale/defaultFieldConfig.properties").
      GetStringFromName("preconfDefaultFieldName");
    this._defaults = [{ name: defName, type: "mltext" }];
  },
};

XPCOMUtils.defineLazyGetter(
  signonMetadataStorage, "_jsonFile",
  function () {
    let dbFile = Cc["@mozilla.org/file/directory_service;1"].
                 getService(Ci.nsIProperties).get("ProfD", Ci.nsILocalFile);
    dbFile.append(MD_FILENAME);
    return dbFile;
  });

XPCOMUtils.defineLazyGetter(
  signonMetadataStorage, "_dbFile",
  function () {
    let dbFile = Cc["@mozilla.org/file/directory_service;1"].
                 getService(Ci.nsIProperties).get("ProfD", Ci.nsILocalFile);
    dbFile.append(MD_DBFILENAME);
    return dbFile;
  });

os.addObserver(signonMetadataStorage, "passwordmgr-storage-changed", true);
