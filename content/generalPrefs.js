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

const PRIVACYPOLICY_URL =
        "https://addons.mozilla.org/addon/password-categories/privacy/";

Cu.import("resource://passwordtags/signonMetadataStorage.jsm");

XPCOMUtils.defineLazyServiceGetter(
  this, "promptSvc",
  "@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");
XPCOMUtils.defineLazyServiceGetter(
  this, "vc",
  "@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");

function cleanup () {
  signonMetadataStorage.removeOrphanedMetadata();
  promptSvc.alert(
    window,
    el("generalprefs-strings").getString("metadataCleanedup.title"),
    el("generalprefs-strings").getString("metadataCleanedup.msg"));
}

function showPrivacyPolicy () {
  window.close();
  openURL(PRIVACYPOLICY_URL);
}

function deleteAllMetadata () {
  var res = promptSvc.confirmEx(
    window,
    el("generalprefs-strings").getString("confirmDeleteAllMetadata.title"),
    el("generalprefs-strings").getString("confirmDeleteAllMetadata.msg"),
    promptSvc.STD_YES_NO_BUTTONS + promptSvc.BUTTON_DELAY_ENABLE,
    null, null, null, null, {});
  if (res != 0) return;

  signonMetadataStorage.removeAllMetadata(false);
  promptSvc.alert(
    window,
    el("generalprefs-strings").getString("allMetadataDeleted.title"),
    el("generalprefs-strings").getString("allMetadataDeleted.msg"));
}

document.addEventListener(
  "DOMContentLoaded",
  function () {
    if (!((Application.name == "Firefox"
           && vc.compare(Application.version, "4.0") >= 0)
          || (Application.name == "SeaMonkey"))) {
      el("syncintegration-group").hidden = true;
      el("deleteallmetadata-btn").hidden = true;
    }
  },
  false);
