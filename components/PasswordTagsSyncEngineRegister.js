/*
    Password Tags, extension for Firefox and others
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

const Cc= Components.classes, Ci = Components.interfaces,
      Cu = Components.utils,
      FIREFOX = "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}",
      SEAMONKEY = "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function PasswordTagsSyncEngineRegister () {}

PasswordTagsSyncEngineRegister.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),

  observe: function (aSubject, aTopic, aData) {
    if (aTopic == "profile-after-change") {
      var appId = Cc["@mozilla.org/xre/app-info;1"].
                  getService(Ci.nsIXULAppInfo).ID;
      if (appId != FIREFOX && appId != SEAMONKEY) return;

      Cu.import("resource://passwordtags/syncEngine.jsm");
      PasswordTagsEngine.register();
    }
  },
};

if (XPCOMUtils.generateNSGetFactory)
  var NSGetFactory =
    XPCOMUtils.generateNSGetFactory([PasswordTagsSyncEngineRegister]);
