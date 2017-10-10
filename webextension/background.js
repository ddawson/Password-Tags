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

var port = browser.runtime.connect({name: "passwordtags-migrate"});
var succNotif = false;
var failNotif = false;

function notifySuccess () {
  browser.tabs.create({ active: false, url: "/success.html" });
  succNotif = true;
}

function notifyFailure () {
  browser.tabs.create({ active: false, url: "/fail.html" });
  failNotif = true;
}

port.onMessage.addListener(aData => {
  let metadata = aData.metadata;

  for (let mdo of metadata) {
    if (mdo.metadata.startsWith("1|")) {
      mdo.metadata = `0|${mdo.unencrMeta}`;
      mdo.se = true;
    } else
      mdo.se = false;
    delete mdo.unencrMeta;
  }

  if (failNotif || !browser.storage) {
    notifyFailure();
    return;
  }

  aData.version = 4;
  if (succNotif) browser.storage.local.set(aData);

  browser.storage.local.get("version")
  .then(aRes => !aRes.version)
  .then(aRes => {
    browser.storage.local.set(aData).then(
      aRes ? notifySuccess : undefined, notifyFailure);
  });
});
