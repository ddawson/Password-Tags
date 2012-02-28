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

  _defaultChangeListeners: [],
  _observerRegistered: false,

  getMetadata: function (aSignon) {
    var mdspec = this._getMetadataJS(aSignon);
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
  },

  getTags: function (aSignon) {
    var mdspec = this._getMetadataJS(aSignon);
    if (!mdspec)
      return "";
    else
      return mdspec.tags;
  },

  setMetadata: function (aSignon, aSignonMeta) {
    var tags = aSignonMeta.tags;
    var metaStr = aSignonMeta.serializeMetadata();
    this._setMetadataJS(aSignon, tags, metaStr);
  },

  setTags: function (aSignon, aTags) {
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
    aTags = tagsAry.join(",");

    this._setMetadataJS(aSignon, aTags);
  },

  removeMetadata: function (aSignon) {
    this._setMetadataJS(aSignon, "", null);
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
    // For now, only the one pref change is being observed.
    this._readDefaultFields();
    for (let i = 0; i < this._defaultChangeListeners.length; i++)
      try {
        this._defaultChangeListeners[i].handleDefaultChange();
      } catch (e) {}
  },

  _getMetadataJS: function (aSignon) {
    if (!this._metadata) this._readMetadataFile();

    var hostname = aSignon.hostname || "",
        httpRealm = aSignon.httpRealm || "",
        formSubmitURL = aSignon.formSubmitURL || "",
        usernameField = aSignon.usernameField || "",
        passwordField = aSignon.passwordField || "",
        username = aSignon.username || "";
    uc.charset = "UTF-8";
    var usernameBytes = uc.convertToByteArray(username,
                                              new Array(username.length));
    ch.init(ch.MD5);
    ch.update(usernameBytes, usernameBytes.length);
    var usernameHash = ch.finish(true);
    var mdspec =
      this._metadata[this._index_concat(
                     hostname, httpRealm, formSubmitURL, usernameField,
                     passwordField, usernameHash)];
    return mdspec ? mdspec : null;
  },

  _setMetadataJS: function (aSignon, aTags, aMetadata) {
    if (!this._metadata) this._readMetadataFile();

    uc.charset = "UTF-8";
    var hostname = aSignon.hostname || "",
        httpRealm = aSignon.httpRealm || "",
        formSubmitURL = aSignon.formSubmitURL || "",
        usernameField = aSignon.usernameField || "",
        passwordField = aSignon.passwordField || "",
        username = aSignon.username || "",
        usernameBytes = uc.convertToByteArray(username,
                                              new Array(username.length));
    ch.init(ch.MD5);
    ch.update(usernameBytes, usernameBytes.length);
    var usernameHash = ch.finish(true);

    let idx = this._index_concat(hostname, httpRealm, formSubmitURL,
                                 usernameField, passwordField, usernameHash);
    if (!aTags && !aMetadata && aMetadata !== undefined)
      delete this._metadata[idx];
    else {
      let mdObj = this._metadata[idx];
      if (mdObj) {
        mdObj.tags = aTags;
        if (aMetadata !== undefined) mdObj.metadata = aMetadata;
      } else {
        mdObj = {
          hostname: hostname, httpRealm: httpRealm,
          formSubmitURL: formSubmitURL, usernameField: usernameField,
          passwordField: passwordField, usernameHash: usernameHash,
          tags: aTags, metadata: aMetadata || "" };
        this._metadata[this._index_concat(
          hostname, httpRealm, formSubmitURL, usernameField, passwordField,
          usernameHash)] = mdObj;
      }
    }

    this._writeMetadataFile();
  },

  _index_concat: function () {
    const pat1 = /\\/g, rep1 = "\\\\",
          pat2 = /,/g, rep2 = "\\,";
    var ret = "";
    for (let i = 0; i < arguments.length; i++) {
      let str = arguments[i];
      ret += str.replace(pat1, rep1).replace(pat2, rep2) + ",";
    }

    return ret;
  },

  _readMetadataFile: function () {
    this._metadata = new Object();
    if (!this._metadataFile.exists()) return;

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
          usernameField = elem.getAttribute("usernameField"),
          passwordField = elem.getAttribute("passwordField"),
          usernameHash = elem.getAttribute("usernameHash"),
          tags = elem.getAttribute(version == "1" ? "category" : "tags"),
          metadata = "";
      if (version == "3")
        metadata = elem.getAttribute("metadata");

      this._metadata[this._index_concat(
                       hostname, httpRealm, formSubmitURL, usernameField,
                       passwordField, usernameHash)] = {
        hostname: hostname, httpRealm: httpRealm, formSubmitURL: formSubmitURL,
        usernameField: usernameField, passwordField: passwordField,
        usernameHash: usernameHash, tags: tags, metadata: metadata };
    }
  },

  _writeMetadataFile: function () {
    var doc = <metadata version="3"/>;

    for each (let val in this._metadata) {
      let signon = <signon hostname={val.hostname} httpRealm={val.httpRealm}
                           formSubmitURL={val.formSubmitURL}
                           usernameField={val.usernameField}
                           passwordField={val.passwordField}
                           usernameHash={val.usernameHash}
                           tags={val.tags} metadata={val.metadata}/>;
      doc.appendChild(signon);
    }

    uc.charset = "UTF-8";
    var docString = uc.ConvertFromUnicode(
                      '<?xml version="1.0" encoding="UTF-8"?>\n' +
                      '<!-- Metadata storage for Password Tags add-on -->\n' +
                      doc.toXMLString()) + uc.Finish();
    var stream = Cc["@mozilla.org/network/file-output-stream;1"].
                 createInstance(Ci.nsIFileOutputStream);
    stream.init(this._metadataFile, -1, -1, -1);
    stream.write(docString, docString.length);
    stream.close();
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
  signonMetadataStorage, "_metadataFile",
  function () {
    let mf = Cc["@mozilla.org/file/directory_service;1"].
             getService(Ci.nsIProperties).get("ProfD", Ci.nsILocalFile);
    mf.append(MD_FILENAME);
    return mf;
  });
