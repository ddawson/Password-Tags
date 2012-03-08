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

var EXPORTED_SYMBOLS = ["SignonMetadata", "signonMetadataStorage"];

const Cc = Components.classes,
      Ci = Components.interfaces,
      Cu = Components.utils,
      MD_DBFILENAME = "signons.sqlite",
      MD_FILENAME = "signoncats.xml";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyServiceGetter(
  this, "os", "@mozilla.org/observer-service;1", "nsIObserverService");
XPCOMUtils.defineLazyGetter(
  this, "uc",
  function () Cc["@mozilla.org/intl/scriptableunicodeconverter"].
              createInstance(Ci.nsIScriptableUnicodeConverter));
XPCOMUtils.defineLazyGetter(
  this, "ch",
  function () Cc["@mozilla.org/security/hash;1"].
              createInstance(Ci.nsICryptoHash));
XPCOMUtils.defineLazyGetter(
  this, "prefs",
  function () Cc["@mozilla.org/preferences-service;1"].
              getService(Ci.nsIPrefService).
              getBranch("extensions.passwordtags.").
              QueryInterface(Ci.nsIPrefBranch2));
XPCOMUtils.defineLazyGetter(
  this, "strings",
  function () Cc["@mozilla.org/intl/stringbundle;1"].
              getService(Ci.nsIStringBundleService).
              createBundle(
                "chrome://passwordtags/locale/defaultFieldConfig.properties"));
XPCOMUtils.defineLazyServiceGetter(
  this, "loginMgr",
  "@mozilla.org/login-manager;1", "nsILoginManager");
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
  consoleSvc.logStringMessage(aMsg);
}


function escape (aRawStr)
  aRawStr.replace(/=/g, "==")
         .replace(/\|/g, "=/")
         .replace(/:/g, "=;");

function unescape (aEStr)
  aEStr.replace(/=;/g, ":")
       .replace(/=\//g, "|")
       .replace(/==/g, "=");

function SignonMetadata () {
  this.tags = "";
  this.metadata = [];
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
    if (mdspec) {
      obj.tags = mdspec.tags;
      metadataStr = mdspec.metadata || null;
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
    return _wrapMetadataInObject(mdspec);
  },

  getMetadataByGUID: function (aGUID) {
    var mdspec = this._getMetadataRawByGUID(aGUID);
    return mdspec;
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
    this._setMetadataRaw(aSignon, tags, metaStr);
  },

  setMetadataFromRecord: function (aMDSpec) {
    this._setMetadataRawFromRecord(aMDSpec);
  },

  changeMetadataGUID: function (aOldGUID, aNewGUID) {
    this._changeGUID(aOldGUID, aNewGUID, true);
  },

  setTags: function (aSignon, aTags) {
    aTags = this._normalizeTags(aTags);
    this._setMetadataRaw(aSignon, aTags);
  },

  _normalizeTags: function (aTags) {
    let tagsAry = [str.trim() for each (str in aTags.split(","))];
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

    outer_loop:
    for (let i = 0; i < allMetadata.length; i++) {
      let mdSpec = allMetadata[i];
      if (this.isOrphaned(mdSpec)) this._removeMetadataByGUID(guid, false);
    }
  },

  isOrphaned: function (aMDSpec) {
    var res = loginMgr.findLogins({}, aMDSpec.hostname, aMDSpec.formSubmitURL,
                                  aMDSpec.httpRealm);
    for (let i = 0; i < res.length; i++) {
      let signon = res[i];
      if (aMDSpec.usernameHash == this._hash(signon.username))
        return false;
    }

    return true;
  },

  removeMetadataByGUID: function (aGUID) {
    this._removeMetadataByGUID(aGUID, true);
  },

  removeAllMetadata: function () {
    this._removeAllMetadata();
  },

  addMetadataChangeListener: function (aListener) {
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
    if (aTopic == "nsPref:changed") {
      // For now, only the one pref is being observed.
      this._readDefaultFields();
      for (let i = 0; i < this._defaultChangeListeners.length; i++)
        try {
          this._defaultChangeListeners[i].handleDefaultChange();
        } catch (e) {}
    } else if (aTopic == "passwordmgr-storage-changed") {
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
    }
  },

  _getMetadataRaw: function (aSignon) {
    if (!this._dbConnection) this._init();
    aSignon.QueryInterface(Ci.nsILoginMetaInfo);

    var guid = aSignon.guid;
    var mdspec = this._findMetadata(guid);
    if (mdspec) return mdspec;

    mdspec = this._findMetadataByData(aSignon);
    if (!mdspec) return null;

    this._changeGUID(mdspec.guid, guid, false);
    mdspec.guid = guid;
    return mdspec;
  },

  _getMetadataRawByGUID: function (aGUID) {
    if (!this._dbConnection) this._init();
    return this._findMetadata(aGUID);
  },

  _setMetadataRaw: function (aSignon, aTags, aMetadata) {
    if (!this._dbConnection) this._init();
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
    if (!this._dbConnection) this._init();

    if (this._findMetadata(aMDSpec.guid))
      this._updateRow(aMDSpec.guid, aMDSpec, true);
    else
      this._addRow(aMDSpec, true);
  },

  _rekeyMetadata: function (aOldSignon, aNewSignon) {
    if (!this._dbConnection) this._init();

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
    if (!this._dbConnection) this._init();
    this._deleteRow(aGUID, aFromSync);
  },

  _removeAllMetadata: function () {
    if (!this._dbConnection) this._init();
    this._deleteAllRows(true);
  },

  _findMetadata: function (aGUID) {
    var stmt;
    try {
      stmt = this._createStatement(
        "SELECT * FROM dd_passwordtags_metadata WHERE guid = :guid");
      stmt.params.guid = aGUID;
      if (stmt.executeStep())
        return {
          id: stmt.row.id,
          hostname: stmt.row.hostname,
          httpRealm: stmt.row.httpRealm,
          formSubmitURL: stmt.row.formSubmitURL,
          usernameHash: stmt.row.usernameHash,
          tags: stmt.row.tags,
          metadata: stmt.row.metadata,
          guid: stmt.row.guid };
      else
        return null;
    } catch (e) {
      log("_findMetadata failed with exception: " + e);
    } finally {
      if (stmt) stmt.reset();
    }
  },

  _findMetadataByData: function (aSignon) {
    var stmt;
    try {
      let stmtStr = "SELECT * FROM dd_passwordtags_metadata WHERE "
        + "hostname = :hostname AND usernameHash = :usernameHash";
      if (aSignon.httpRealm) stmtStr += " AND httpRealm = :httpRealm";
      if (aSignon.formSubmitURL)
        stmtStr += " AND formSubmitURL = :formSubmitURL";
      stmt = this._createStatement(stmtStr);
      stmt.params.hostname = aSignon.hostname;
      if (aSignon.httpRealm) stmt.params.httpRealm = aSignon.httpRealm;
      if (aSignon.formSubmitURL)
        stmt.params.formSubmitURL = aSignon.formSubmitURL;
      stmt.params.usernameHash = this._hash(aSignon.username);

      if (stmt.executeStep()) {
        return {
          hostname: stmt.row.hostname,
          httpRealm: stmt.row.httpRealm,
          formSubmitURL: stmt.row.formSubmitURL,
          usernameHash: stmt.row.usernameHash,
          tags: stmt.row.tags,
          metadata: stmt.row.metadata,
          guid: stmt.row.guid };
      } else
        return null;
    } catch (e) {
      log("_findMetadataByData failed with exception: " + e);
    } finally {
      if (stmt) stmt.reset();
    }
  },

  _getAllMetadata: function () {
    if (!this._dbConnection) this._init();

    var stmt;
    try {
      let allMetadata = [];
      stmt = this._dbConnection.createStatement(
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
        allMetadata.push(mdSpec);
      }

      return allMetadata;
    } catch (e) {
      log("_getAllMetadata failed with exception: " + e);
    } finally {
      if (stmt) stmt.reset();
    }
  },

  _addRow: function (aMDSpec, aFromSync) {
    var stmt;
    try {
      stmt = this._createStatement(
        "INSERT INTO dd_passwordtags_metadata "
        + "(hostname, httpRealm, formSubmitURL, usernameHash, "
        + "tags, metadata, guid) VALUES "
        + "(:hostname, :httpRealm, :formSubmitURL, :usernameHash, "
        + ":tags, :metadata, :guid)");
      for each (let name in ["hostname", "httpRealm", "formSubmitURL",
                             "usernameHash", "tags", "metadata", "guid"])
        stmt.params[name] = aMDSpec[name];
      stmt.execute();
      if (!aFromSync) this.notifyMetadataChangeListeners(aMDSpec.guid);
    } catch (e) {
      log("_addRow failed with exception: " + e);
    } finally {
      if (stmt) stmt.reset();
    }
  },

  _updateRow: function (aGUID, aMDSpec, aFromSync) {
    var stmt;
    try {
      stmt = this._createStatement(
        "UPDATE dd_passwordtags_metadata SET "
        + "hostname = :hostname, "
        + "httpRealm = :httpRealm, "
        + "formSubmitURL = :formSubmitURL, "
        + "usernameHash = :usernameHash, "
        + "tags = :tags, "
        + "metadata = :metadata, "
        + "guid = :guid "
        + "WHERE guid = :oldguid");
      for each (let name in ["hostname", "httpRealm", "formSubmitURL",
                             "usernameHash", "tags", "metadata", "guid"])
        stmt.params[name] = aMDSpec[name];
      stmt.params.oldguid = aGUID;
      stmt.execute();
      if (!aFromSync) this.notifyMetadataChangeListeners(aMDSpec.guid);
    } catch (e) {
      log("_updateRow failed with exception: " + e);
    } finally {
      if (stmt) stmt.reset();
    }
  },

  _changeGUID: function (aOldGUID, aNewGUID, aFromSync) {
    var stmt;
    try {
      stmt = this._createStatement(
        "UPDATE dd_passwordtags_metadata "
        + "SET guid = :newGUID WHERE guid = :oldGUID");
      stmt.params.oldGUID = aOldGUID;
      stmt.params.newGUID = aNewGUID;
      stmt.execute();
      if (!aFromSync) {
        this.notifyMetadataChangeListeners(aOldGUID);
        this.notifyMetadataChangeListeners(aNewGUID);
      }
    } catch (e) {
      log("_changeGUID failed with exception: " + e);
    } finally {
      if (stmt) stmt.reset();
    }
  },

  _deleteRow: function (aGUID, aFromSync) {
    var stmt;
    try {
      stmt = this._createStatement(
        "DELETE FROM dd_passwordtags_metadata WHERE guid = :guid");
      stmt.params.guid = aGUID;
      stmt.execute();
      if (!aFromSync) this.notifyMetadataChangeListeners(aGUID);
    } catch (e) {
      log("_deleteRow failed with exception: " + e);
    } finally {
      if (stmt) stmt.reset();
    }
  },

  _deleteAllRows: function (aFromSync) {
    try {
      this._dbConnection.executeSimpleSQL(
        "DELETE FROM dd_passwordtags_metadata");
      if (!aFromSync) this.notifyMetadataChangeListenersAllGUIDs();
    } catch (e) {
      log("_deleteAllRows failed with exception: " + e);
    }
  },

  _createStatement: function (aStmtStr) {
    var stmt = this._dbStmts[aStmtStr];
    if (stmt) return stmt;
    stmt = this._dbConnection.createStatement(aStmtStr);
    this._dbStmts[aStmtStr] = stmt;
    return stmt;
  },

  _init: function () {
    this._dbStmts = [];

    if (!this._initDBConnection()) {
      let metadataAry = this._readMetadataFile();
      if (metadataAry) {
        for (let i = 0; i < metadataAry.length; i++) {
          let metadata = metadataAry[i];
          let res = loginMgr.findLogins(
            {}, metadata.hostname, metadata.formSubmitURL || null,
            metadata.httpRealm || null);

          let j;
          for (j = 0; j < res.length; j++) {
            let cand = res[j];
            let hash = this._hash(cand.username);
            if (hash == metadata.usernameHash) {
              metadata.guid = cand.QueryInterface(Ci.nsILoginMetaInfo).guid;
              break;
            }
          }
          if (j == res.length)
            metadata.guid = uuidGen.generateUUID().toString();

          this._addRow(metadata, false);
        }
      }

      if (this._metadataFile.exists())
        this._metadataFile.remove(false);
    }
  },

  _initDBConnection: function () {
    this._dbConnection = storageSvc.openDatabase(this._dbFile);
    if (this._dbConnection.tableExists(this._tableSchema.tableName))
      return true;

    this._dbConnection.createTable(this._tableSchema.tableName,
                                   this._tableSchema.table);
    for (let name in this._tableSchema.indices)
      this._dbConnection.executeSimpleSQL(
        "CREATE INDEX IF NOT EXISTS " + name
        + " ON " + this._tableSchema.tableName
        + "(" + this._tableSchema.indices[name] + ")");

    return false;
  },

  _tableSchema: {
    tableName: "dd_passwordtags_metadata",

    table: "id            INTEGER PRIMARY KEY," +
           "hostname      TEXT NOT NULL," +
           "httpRealm     TEXT," +
           "formSubmitURL TEXT," +
           "usernameHash  TEXT NOT NULL," +
           "tags          TEXT NOT NULL," +
           "metadata      TEXT," +
           "guid          TEXT",

    indices: {
      dd_passwordtags_metadata_hostname_formSubmitURL_index:
        "hostname, formSubmitURL",
      dd_passwordtags_metadata_hostname_formSubmitURL_usernameHash_index:
        "hostname, formSubmitURL, usernameHash",
      dd_passwordtags_metadata_hostname_httpRealm_usernameHash_index:
        "hostname, httpRealm, usernameHash",
      dd_passwordtags_metadata_hostname_usernameHash_index:
        "hostname, usernameHash",
      dd_passwordtags_metadata_guid_index:
        "guid",
    },
  },

  _hash: function (aPlain) {
    uc.charset = "UTF-8";
    var bytes = uc.convertToByteArray(aPlain, new Array(aPlain.length));
    ch.init(ch.MD5);
    ch.update(bytes, bytes.length);
    return ch.finish(true);
  },

  _readMetadataFile: function () {
    if (!this._metadataFile.exists()) return null;
    var metadataAry = new Array();

    var fstream = Cc["@mozilla.org/network/file-input-stream;1"].
                  createInstance(Ci.nsIFileInputStream);
    var sstream = Cc["@mozilla.org/scriptableinputstream;1"].
                  createInstance(Ci.nsIScriptableInputStream);
    fstream.init(this._metadataFile, -1, 0, 0);
    sstream.init(fstream);
    var contents = sstream.read(sstream.available());
    sstream.close();
    fstream.close();

    uc.charset = "UTF-8";
    contents = uc.ConvertToUnicode(contents);

    var doc = Cc["@mozilla.org/xmlextras/domparser;1"].
              createInstance(Ci.nsIDOMParser).
              parseFromString(contents, "text/xml");

    var root = doc.documentElement;
    if ((root.tagName != "cats" && root.tagName != "tags" &&
         root.tagName != "metadata") || !root.hasAttribute("version"))
      return;
    let version = root.getAttribute("version");
    if (version != "1" && version != "2" && version != "3")
      return;

    var soSection = root;
    for (let elem = soSection.firstChild; elem; elem = elem.nextSibling) {
      if (elem.nodeType != 1 || elem.tagName != "signon")
        continue;
      let hostname = elem.getAttribute("hostname"),
          httpRealm = elem.getAttribute("httpRealm"),
          formSubmitURL = elem.getAttribute("formSubmitURL"),
          usernameHash = elem.getAttribute("usernameHash"),
          tags = elem.getAttribute(version == "1" ? "category" : "tags"),
          metadata = "";
      if (version == "3")
        metadata = elem.getAttribute("metadata");

      metadataAry.push({
        hostname: hostname, httpRealm: httpRealm, formSubmitURL: formSubmitURL,
        usernameHash: usernameHash, tags: tags, metadata: metadata });
    }

    return metadataAry;
  },

  _readDefaultFields: function () {
    if (!prefs.prefHasUserValue("defaultFields")) {
      this._resetDefaults();
      return;
    }

    var serialString = prefs.getCharPref("defaultFields");
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

    prefs.setCharPref("defaultFields", str);
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
  signonMetadataStorage, "_dbFile",
  function () {
    let dbFile = Cc["@mozilla.org/file/directory_service;1"].
                 getService(Ci.nsIProperties).get("ProfD", Ci.nsILocalFile);
    dbFile.append(MD_DBFILENAME);
    return dbFile;
  });
XPCOMUtils.defineLazyGetter(
  signonMetadataStorage, "_metadataFile",
  function () {
    let mf = Cc["@mozilla.org/file/directory_service;1"].
             getService(Ci.nsIProperties).get("ProfD", Ci.nsILocalFile);
    mf.append(MD_FILENAME);
    return mf;
  });

os.addObserver(signonMetadataStorage, "passwordmgr-storage-changed", true);
