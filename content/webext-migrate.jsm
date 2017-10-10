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

var EXPORTED_SYMBOLS = ["PasswordTags_WE"];

var PasswordTags_WE = {
  port: null,
  pendingData: null,

  updateData: function (aData) {
    if (!this.port)
      this.pendingData = aData;
    else
      this.port.postMessage(aData);
  },

  initPort: function (aPort) {
    this.port = aPort;
    if (this.pendingData) this.updateData(this.pendingData);
    this.pendingData = null;
  },
};

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

const addonID = "passwordcategories@daniel.dawson";
const { AddonManager } =
  Cu.import("resource://gre/modules/AddonManager.jsm", {});

if (Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).ID
    == "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}") {
  // Firefox only

  AddonManager.getAddonByID(addonID, aAddon => {
    const baseURI = aAddon.getResourceURI("/");

    const { LegacyExtensionsUtils } =
      Cu.import("resource://gre/modules/LegacyExtensionsUtils.jsm");

    const embedWE = LegacyExtensionsUtils.getEmbeddedExtensionFor(
      { id: addonID, resourceURI: baseURI });

    embedWE.startup().then(({browser}) => {
      browser.runtime.onConnect.addListener(aPort => {
        if (aPort.name == "passwordtags-migrate")
          PasswordTags_WE.initPort(aPort);
      });
    }).catch(err => {
      Cu.reportError(
        `${addonID} - embedded webextension startup failed: \
	${err.message} ${err.stack}\n`);
    });
  });

  Cu.import("resource://gre/modules/Services.jsm");
  Cu.import("resource://passwordtags/signonMetadataStorage.jsm");
  let prefs = Services.prefs.getBranch("extensions.passwordtags.");

  if (!prefs.getBoolPref("migrated", false)) {
    let res = signonMetadataStorage.convertAllMetadata();
    if (res) prefs.setBoolPref("migrated", true);
  }
}
