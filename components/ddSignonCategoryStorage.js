/*
    Password Categories, extension for Firefox 3.5+ and others
    Copyright (C) 2010  Daniel Dawson <ddawson@icehouse.net>

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
    CAT_FILENAME = "signoncats.xml";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function ddSignonCategoryStorage () {}

ddSignonCategoryStorage.prototype = {
  classDescription:  "Signon Category Storage",
  classID:           Components.ID("{62da6726-6d2b-4916-8bf7-fe48b986edb3}"),
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
      this._readCatFile();
      uc.charset = "UTF-8";
      break;
    }
  },

  getCategory: function (signon) {
    var hostname = signon.hostname || "",
        httpRealm = signon.httpRealm || "",
        formSubmitURL = signon.formSubmitURL || "",
        usernameField = signon.usernameField || "",
        passwordField = signon.passwordField || "",
        username = signon.username || "";
    var usernameBytes = uc.convertToByteArray(username,
                                              new Array(username.length));
    ch.init(ch.MD5);
    ch.update(usernameBytes, usernameBytes.length);
    var usernameHash = ch.finish(true);
    var catspec =
      this._cats[this._index_concat(
                   hostname, httpRealm, formSubmitURL, usernameField,
                   passwordField, usernameHash)];
    if (catspec === undefined)
      return "";
    else
      return catspec.category;
  },
  
  setCategory: function (signon, category) {
    var hostname = signon.hostname || "",
        httpRealm = signon.httpRealm || "",
        formSubmitURL = signon.formSubmitURL || "",
        usernameField = signon.usernameField || "",
        passwordField = signon.passwordField || "",
        username = signon.username || "",
        usernameBytes = uc.convertToByteArray(username,
                                              new Array(username.length));
    ch.init(ch.MD5);
    ch.update(usernameBytes, usernameBytes.length);
    var usernameHash = ch.finish(true);
    if (category)
      this._cats[this._index_concat(
                   hostname, httpRealm, formSubmitURL, usernameField,
                   passwordField, usernameHash)] = {
        hostname: hostname, httpRealm: httpRealm, formSubmitURL: formSubmitURL,
        usernameField: usernameField, passwordField: passwordField,
        usernameHash: usernameHash, category: category };
    else
      delete this._cats[this._index_concat(
                          hostname, httpRealm, formSubmitURL, usernameField,
                          passwordField, usernameHash)];
    this._writeCatFile();
  },

  _index_concat: function (a,b,c,d,e,f) {
    const pat = /,/g, rep = "\\,";
    return a.replace(pat, rep)+","+b.replace(pat, rep)+","+
           c.replace(pat, rep)+","+d.replace(pat, rep)+","+
           e.replace(pat, rep)+","+f.replace(pat, rep)+",";
  },

  _readCatFile: function () {
    this._catFile = Cc["@mozilla.org/file/directory_service;1"].
      getService(Ci.nsIProperties).get("ProfD", Ci.nsILocalFile);
    this._catFile.append(CAT_FILENAME);
    this._cats = new Object();
    if (!this._catFile.exists()) return;

    var fstream = Cc["@mozilla.org/network/file-input-stream;1"].
                  createInstance(Ci.nsIFileInputStream);
    var sstream = Cc["@mozilla.org/scriptableinputstream;1"].
                  createInstance(Ci.nsIScriptableInputStream);
    fstream.init(this._catFile, -1, 0, 0);
    sstream.init(fstream);
    var contents = sstream.read(sstream.available());
    sstream.close();
    fstream.close();

    var doc = Cc["@mozilla.org/xmlextras/domparser;1"].
              createInstance(Ci.nsIDOMParser).
              parseFromString(contents, "text/xml");

    var root = doc.documentElement;
    if (root.tagName != "cats" || !root.hasAttribute("version") ||
        root.getAttribute("version") != "1")
      return;

    for (let elem = root.firstChild; elem; elem = elem.nextSibling) {
      if (elem.nodeType != 1 || elem.tagName != "signon")
        continue;
      let hostname = elem.getAttribute("hostname"),
          httpRealm = elem.getAttribute("httpRealm"),
          formSubmitURL = elem.getAttribute("formSubmitURL"),
          usernameField = elem.getAttribute("usernameField"),
          passwordField = elem.getAttribute("passwordField"),
          usernameHash = elem.getAttribute("usernameHash"),
          category = elem.getAttribute("category");
      this._cats[this._index_concat(
                   hostname, httpRealm, formSubmitURL, usernameField,
                   passwordField, usernameHash)] = {
        hostname: hostname, httpRealm: httpRealm, formSubmitURL: formSubmitURL,
        usernameField: usernameField, passwordField: passwordField,
        usernameHash: usernameHash, category: category };
    }
  },

  _writeCatFile: function () {
    var doc = <cats version="1"/>;
    for each (let val in this._cats) {
      let signon = <signon hostname={val.hostname} httpRealm={val.httpRealm}
                           formSubmitURL={val.formSubmitURL}
                           usernameField={val.usernameField}
                           passwordField={val.passwordField}
                           usernameHash={val.usernameHash}
                           category={val.category}/>;
      doc.appendChild(signon);
    }

    var docString = uc.ConvertFromUnicode(
                      '<?xml version="1.0" encoding="UTF-8"?>\n' +
                      doc.toXMLString()) + uc.Finish();
    var stream = Cc["@mozilla.org/network/file-output-stream;1"].
                 createInstance(Ci.nsIFileOutputStream);
    stream.init(this._catFile, -1, -1, -1);
    stream.write(docString, docString.length);
    stream.close();
  },
};

if (XPCOMUtils.generateNSGetFactory)
  var NSGetFactory =
    XPCOMUtils.generateNSGetFactory([ddSignonCategoryStorage]);
else
  var NSGetModule =
    XPCOMUtils.generateNSGetModule([ddSignonCategoryStorage]);
