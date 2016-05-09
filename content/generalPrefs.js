/*
    Password Tags, extension for Firefox and others
    Copyright (C) 2016  Daniel Dawson <danielcdawson@gmail.com>

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
