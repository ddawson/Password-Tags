/*
    Password Tags, extension for Firefox 3.5+ and others
    Copyright (C) 2011  Daniel Dawson <ddawson@icehouse.net>

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

const Cc = Components.classes,
    Ci = Components.interfaces,
    Cu = Components.utils,
    os = Cc["@mozilla.org/observer-service;1"].
         getService(Ci.nsIObserverService),
    uc = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
         createInstance(Ci.nsIScriptableUnicodeConverter);
    ch = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash),
    MD_FILENAME = "signoncats.xml";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function ddSignonMetadataField () {
  this._name = "";
  this._type = -1;
  this._value = "";
}

ddSignonMetadataField.prototype = {
  classDescription:  "Signon Metadata Field",
  classID:           Components.ID("{82bc2588-7629-498f-9c4a-ae0f96a69ef0}"),
  contractID:        "@daniel.dawson/signonmetadatafield;1",
  _xpcom_categories: [],
  QueryInterface:    XPCOMUtils.generateQI([Ci.ddISignonMetadataField]),

  init: function (aName, aType, aValue) {
    this._name = aName;
    this._type = aType;
    this._value = aValue;
  },

  get name () this._name,
  get type () this._type,
  get value () this._value,
  set name (aName) { this._name = aName; },
  set type (aType) { this._type = aType; },
  set value (aValue) { this._value = aValue; },
};

function ddSignonMetadata () {
  this._tags = "";
  this._metadata = [];
}

ddSignonMetadata.prototype = {
  classDescription:  "Signon Metadata",
  classID:           Components.ID("{29d46f03-82ef-47e4-8dd1-2f83f3b8bef6}"),
  contractID:        "@daniel.dawson/signonmetadata;1",
  _xpcom_categories: [],
  QueryInterface:    XPCOMUtils.generateQI([Ci.ddISignonMetadata]),

  getTags: function () this._tags,

  serializeMetadata: function () {
    var str = "";

    for (let i = 0; i < this._metadata.length; i++) {
      let obj = this._metadata[i];
      let name = obj.name, type = obj.type, value = obj.value;
      let eName = this._escape(name),
          eValue = this._escape(value);
      if (str !== "") str += "|";
      str += eName + ":" + type + ":" + eValue;
    }

    return str;
  },

  setTags: function (aTags) {
    this._tags = aTags;
  },

  setMetadataFromString: function (aSerialString) {
    this._metadata = [];
    var fieldStrs = aSerialString.split("|");

    for (let i = 0; i < fieldStrs.length; i++) {
      let eParts = fieldStrs[i].split(":");
      let name = this._unescape(eParts[0]), value = this._unescape(eParts[2]);
      this._metadata.push({ name: name, type: eParts[1], value: value });
    }
  },

  getNumberOfFields: function () this._metadata.length,

  insertField: function (aIdx, aName, aType, aValue) {
    if (aIdx > this._metadata.length || aIdx < -1)
      throw Components.Exception("Index out of range",
                                 Components.result.NS_ERROR_ILLEGAL_VALUE);

    if (aIdx == -1) aIdx = this._metadata.length;
    this._metadata.splice(aIdx, 0,
                          { name: aName, type: aType, value: aValue });
  },

  removeField: function (aIdx) {
    if (aIdx >= this._metadata.length || aIdx < 0)
      throw Components.Exception("Index out of range",
                                 Components.result.NS_ERROR_ILLEGAL_VALUE);

    this._metadata.splice(aIdx, 1);
  },

  getField: function (aIdx) {
    if (aIdx >= this._metadata.length || aIdx < 0)
      throw Components.Exception("Index out of range",
                                 Components.result.NS_ERROR_ILLEGAL_VALUE);
  
    var fld = this._metadata[aIdx];
    var obj = Cc["@daniel.dawson/signonmetadatafield;1"].
              createInstance(Ci.ddISignonMetadataField);
    obj.init(fld.name, fld.type, fld.value);
    return obj;
  },

  getFields: function (aLength) {
    var ary = [];
    for (var i = 0; i < this._metadata.length; i++) {
      let obj = this.getField(i);
      ary.push(obj);
    }
    aLength.value = ary.length;
    return ary;
  },

  _escape: function (aRawStr)
    aRawStr.replace(/=/g, "==")
           .replace(/\|/g, "=/")
           .replace(/:/g, "=;"),

  _unescape: function (aEStr)
    aEStr.replace(/=;/g, ":")
         .replace(/=\//g, "|")
         .replace(/==/g, "="),
};

function ddSignonCategoryStorage () {}

ddSignonCategoryStorage.prototype = {
  classDescription:  "Signon Metadata Storage",
  classID:           Components.ID("{dbf0a7d4-14a7-406c-b74d-ddb1e005026b}"),
  contractID:        "@daniel.dawson/signoncategorystorage;1",
  _xpcom_categories: [{ category: "app-startup", service: true }],
  QueryInterface:    XPCOMUtils.generateQI(
                       [Ci.nsIObserver, Ci.ddISignonCategoryStorage]),

  observe: function (aSubject, aTopic, aData) {
    switch (aTopic) {
    case "app-startup":
      os.addObserver(this, "profile-after-change", false);
      break;

    case "profile-after-change":
      uc.charset = "UTF-8";
      break;
    }
  },

  getMetadata: function (aSignon) {
    var mdspec = this._getMetadataJS(aSignon);
    if (mdspec) {
      var obj = Cc["@daniel.dawson/signonmetadata;1"].
                createInstance(Ci.ddISignonMetadata);
      obj.setTags(mdspec.tags);
      obj.setMetadataFromString(mdspec.metadata);
      return obj;
    } else
      return null;
  },

  getTags: function (aSignon) {
    var mdspec = this._getMetadataJS(aSignon);
    if (!mdspec)
      return "";
    else
      return mdspec.tags;
  },

  setMetadata: function (aSignon, aSignonMeta) {
    var tags = aSignonMeta.getTags();
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

  getNumberOfDefaultFields: function () this._defaults.length,

  insertDefaultField: function (aIdx, aName, aType) {
    if (aIdx > this._defaults.length || aIdx < -1)
      throw Components.Exception("Index out of range",
                                 Components.result.NS_ERROR_ILLEGAL_VALUE);

    if (aIdx == -1) aIdx = this._defaults.length;
    this._defaults.splice(aIdx, 0, { name: aName, type: aType });
  },

  removeDefaultField: function (aIdx) {
    if (aIdx >= this._defaults.length || aIdx < 0)
      throw Components.Exception("Index out of range",
                                 Components.result.NS_ERROR_ILLEGAL_VALUE);

    this._defaults.splice(aIdx, 1);
  },

  getDefaultField: function (aIdx) {
    if (aIdx >= this._defaults.length || aIdx < 0)
      throw Components.Exception("Index out of range",
                                 Components.result.NS_ERROR_ILLEGAL_VALUE);

    var fld = this._defaults[aIdx];
    var obj = Cc["@daniel.dawson/signonmetadatafield;1"].
              createInstance(Ci.ddISignonMetadataField);
    obj.init(fld.name, fld.type, fld.value);
    return obj;
  },

  getDefaultFields: function (aLength) {
    var ary = [];
    for (var i = 0; i < this._defaults.length; i++) {
      let obj = this.getDefaultField(i);
      ary.push(obj);
    }
    aLength.value = ary.length;
    return ary;
  },

  _getMetadataJS: function (aSignon) {
    if (!this._metadata) this._readMetadataFile();

    var hostname = aSignon.hostname || "",
        httpRealm = aSignon.httpRealm || "",
        formSubmitURL = aSignon.formSubmitURL || "",
        usernameField = aSignon.usernameField || "",
        passwordField = aSignon.passwordField || "",
        username = aSignon.username || "";
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

    let mdObj = this._metadata[this._index_concat(
                  hostname, httpRealm, formSubmitURL, usernameField,
                  passwordField, usernameHash)];
    if (mdObj) {
      mdObj.tags = aTags;
      if (aMetadata) mdObj.metadata = aMetadata;
    } else {
      mdObj = {
        hostname: hostname, httpRealm: httpRealm,
        formSubmitURL: formSubmitURL, usernameField: usernameField,
        passwordField: passwordField, usernameHash: usernameHash, tags: aTags,
        metadata: aMetadata ? aMetadata : "" };
      this._metadata[this._index_concat(
        hostname, httpRealm, formSubmitURL, usernameField, passwordField,
        usernameHash)] = mdObj;
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
    this._metadataFile = Cc["@mozilla.org/file/directory_service;1"].
      getService(Ci.nsIProperties).get("ProfD", Ci.nsILocalFile);
    this._metadataFile.append(MD_FILENAME);
    this._defaults = new Array();
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
    if (version == "3") {
      let dfltSection = null;
      for (let section = root.firstChild; section;
           section = section.nextSibling) {
        if (section.nodeType != 1) continue;
        if (section.tagName == "defaults") dfltSection = section;
        if (section.tagName == "signons") soSection = section;
      }

      if (dfltSection) {
        for (let elem = dfltSection.firstChild; elem;
             elem = elem.nextSibling) {
          if (elem.nodeType != 1 || elem.tagName != "default") continue;

          uc.charset = "UTF-8";
          let name = elem.getAttribute("name"),
              type = elem.getAttribute("type");
          this._defaults.push({name: name, type: type});
        }
      }
    }

    for (let elem = soSection.firstChild; elem; elem = elem.nextSibling) {
      if (elem.nodeType != 1 || elem.tagName != "signon")
        continue;
      uc.charset = "UTF-8";
      let hostname = elem.getAttribute("hostname"),
          httpRealm = elem.getAttribute("httpRealm"),
          formSubmitURL = elem.getAttribute("formSubmitURL"),
          usernameField = elem.getAttribute("usernameField"),
          passwordField = elem.getAttribute("passwordField"),
          usernameHash = elem.getAttribute("usernameHash"),
          tags = uc.ConvertToUnicode(
            elem.getAttribute(version == "1" ? "category" : "tags")),
          metadata = "";
      if (version == "3") {
        uc.charset = "UTF-8";
        metadata = uc.ConvertToUnicode(elem.getAttribute("metadata"));
      }

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
    var sect = <defaults/>;
    for (let i = 0; i < this._defaults.length; i++) {
      let obj = this._defaults[i];
      let def = <default name={obj.name} type={obj.type}/>;
      sect.appendChild(def);
    }
    doc.appendChild(sect);

    sect = <signons/>;
    for each (let val in this._metadata) {
      let signon = <signon hostname={val.hostname} httpRealm={val.httpRealm}
                           formSubmitURL={val.formSubmitURL}
                           usernameField={val.usernameField}
                           passwordField={val.passwordField}
                           usernameHash={val.usernameHash}
                           tags={val.tags} metadata={val.metadata}/>;
      sect.appendChild(signon);
    }
    doc.appendChild(sect);

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
};

ddSignonCategoryStorage.prototype.getCategory =
  ddSignonCategoryStorage.prototype.getTags;
ddSignonCategoryStorage.prototype.setCategory =
  ddSignonCategoryStorage.prototype.setTags;

if (XPCOMUtils.generateNSGetFactory)
  var NSGetFactory =
    XPCOMUtils.generateNSGetFactory(
      [ddSignonMetadataField, ddSignonMetadata, ddSignonCategoryStorage]);
else
  var NSGetModule =
    XPCOMUtils.generateNSGetModule(
      [ddSignonMetadataField, ddSignonMetadata, ddSignonCategoryStorage]);
