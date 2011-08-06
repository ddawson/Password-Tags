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
    CAT_FILENAME = "signoncats.xml";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function ddSignonCategoryStorage () {}

ddSignonCategoryStorage.prototype = {
  classDescription:  "Signon Tags Storage",
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
      uc.charset = "UTF-8";
      break;
    }
  },

  getCategory: function (signon) {
    if (!this._tags) this._readTagsFile();

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
    var tagsspec =
      this._tags[this._index_concat(
                   hostname, httpRealm, formSubmitURL, usernameField,
                   passwordField, usernameHash)];
    if (tagsspec === undefined)
      return "";
    else
      return tagsspec.tags;
  },
  
  setCategory: function (signon, tags) {
    if (!this._tags) this._readTagsFile();

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

    if (tags) {
      let tagsAry = [str.trim() for each (str in tags.split(","))];
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
      tags = tagsAry.join(",");

      this._tags[this._index_concat(
                   hostname, httpRealm, formSubmitURL, usernameField,
                   passwordField, usernameHash)] = {
        hostname: hostname, httpRealm: httpRealm, formSubmitURL: formSubmitURL,
        usernameField: usernameField, passwordField: passwordField,
        usernameHash: usernameHash, tags: tags };
    } else
      delete this._tags[this._index_concat(
                          hostname, httpRealm, formSubmitURL, usernameField,
                          passwordField, usernameHash)];
    this._writeTagsFile();
  },

  _index_concat: function (a,b,c,d,e,f) {
    const pat = /,/g, rep = "\\,";
    return a.replace(pat, rep)+","+b.replace(pat, rep)+","+
           c.replace(pat, rep)+","+d.replace(pat, rep)+","+
           e.replace(pat, rep)+","+f.replace(pat, rep)+",";
  },

  _readTagsFile: function () {
    this._tagsFile = Cc["@mozilla.org/file/directory_service;1"].
      getService(Ci.nsIProperties).get("ProfD", Ci.nsILocalFile);
    this._tagsFile.append(CAT_FILENAME);
    this._tags = new Object();
    if (!this._tagsFile.exists()) return;

    var fstream = Cc["@mozilla.org/network/file-input-stream;1"].
                  createInstance(Ci.nsIFileInputStream);
    var sstream = Cc["@mozilla.org/scriptableinputstream;1"].
                  createInstance(Ci.nsIScriptableInputStream);
    fstream.init(this._tagsFile, -1, 0, 0);
    sstream.init(fstream);
    var contents = sstream.read(sstream.available());
    sstream.close();
    fstream.close();

    var doc = Cc["@mozilla.org/xmlextras/domparser;1"].
              createInstance(Ci.nsIDOMParser).
              parseFromString(contents, "text/xml");

    var root = doc.documentElement;
    if ((root.tagName != "cats" && root.tagName != "tags") ||
        !root.hasAttribute("version"))
      return;
    let version = root.getAttribute("version");
    if (version != "1" && version != "2")
      return;

    for (let elem = root.firstChild; elem; elem = elem.nextSibling) {
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
            elem.getAttribute(version == "2" ? "tags" : "category"));
      this._tags[this._index_concat(
                   hostname, httpRealm, formSubmitURL, usernameField,
                   passwordField, usernameHash)] = {
        hostname: hostname, httpRealm: httpRealm, formSubmitURL: formSubmitURL,
        usernameField: usernameField, passwordField: passwordField,
        usernameHash: usernameHash, tags: tags };
    }
  },

  _writeTagsFile: function () {
    var doc = <tags version="2"/>;
    for each (let val in this._tags) {
      let signon = <signon hostname={val.hostname} httpRealm={val.httpRealm}
                           formSubmitURL={val.formSubmitURL}
                           usernameField={val.usernameField}
                           passwordField={val.passwordField}
                           usernameHash={val.usernameHash}
                           tags={val.tags}/>;
      doc.appendChild(signon);
    }

    uc.charset = "UTF-8";
    var docString = uc.ConvertFromUnicode(
                      '<?xml version="1.0" encoding="UTF-8"?>\n' +
                      '<!-- Tags storage for Password Tags add-on -->\n' +
                      doc.toXMLString()) + uc.Finish();
    var stream = Cc["@mozilla.org/network/file-output-stream;1"].
                 createInstance(Ci.nsIFileOutputStream);
    stream.init(this._tagsFile, -1, -1, -1);
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
