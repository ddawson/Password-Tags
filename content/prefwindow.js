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

const Cc = Components.classes,
      Ci = Components.interfaces,
      Cu = Components.utils;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://passwordtags/signonMetadataStorage.jsm");

function el (aEl) { return document.getElementById(aEl); }

function initWindow () {
  if (!window.arguments) return;
  let startPane = window.arguments[0];
  if (startPane == "general")
    document.documentElement.showPane(el("generalprefs-pane"));
  else if (startPane == "defaultfieldconfig")
    document.documentElement.showPane(el("defaultfieldconfig-pane"));
}

function dialogAccepted () {
  return defaultFieldConfig.applyChanges();
}

function onClose () {
  return defaultFieldConfig.close();
}
