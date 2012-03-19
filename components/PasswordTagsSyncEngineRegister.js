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

const Ci = Components.interfaces, Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function PasswordTagsSyncEngineRegister () {}

PasswordTagsSyncEngineRegister.prototype = {
  classDescription:  "Password Tags Sync engine register",
  classID:           Components.ID("{0edcc8da-9cd3-4d02-b463-20c69bbe62b9}"),
  contractID:        "@daniel.dawson/passwordtags/syncengine-register;1",
  QueryInterface:    XPCOMUtils.generateQI([Ci.nsIObserver]),

  observe: function (aSubject, aTopic, aData) {
    if (aTopic == "profile-after-change") {
      Cu.import("resource://passwordtags/syncEngine.jsm");
      PasswordTagsEngine.register();
    }
  },
};

if (XPCOMUtils.generateNSGetFactory)
  var NSGetFactory =
    XPCOMUtils.generateNSGetFactory([PasswordTagsSyncEngineRegister]);
