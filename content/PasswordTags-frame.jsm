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

var EXPORTED_SYMBOLS = ["PasswordTags"];

const htmlNamespaceResolver =
  aPrefix => aPrefix == "xhtml" ? "http://www.w3.org/1999/xhtml" : null;

var PasswordTags = {
  getFormData (aElement) {
    const HTMLInputElement =
      aElement.ownerDocument.defaultView.HTMLInputElement;

    if (aElement instanceof HTMLInputElement && aElement.form) {
      var form = aElement.form;
    } else
      return null;

    var curDoc = aElement.ownerDocument;
    var curLocation = curDoc.defaultView.location;
    var hostname = `${curLocation.protocol}//${curLocation.host}`;
    var passwordField = null;
    for (var i = 0; i < form.elements.length; i++) {
      let element = form.elements[i];
      if (element instanceof HTMLInputElement
          && element.type.toLowerCase() == "password") {
        passwordField = element;
        break;
      }
    }
    if (!passwordField) return null;

    var usernameField = null;
    for (i = i - 1; i >= 0; i--) {
      let element = form.elements[i];
      if (!element instanceof HTMLInputElement) continue;
      let elType = (element.getAttribute("type") || "").toLowerCase();
      if (!elType || elType == "text" || elType == "email" || elType == "url"
          || elType == "tel" || elType == "number") {
        usernameField = element;
        break;
      }
    }
    if (!usernameField) return null;

    var formAction = form.action;
    var res;
    if (formAction && formAction.startsWith("javascript:"))
      res = "javascript:";
    else {
      res = formAction ? /^([0-9-_A-Za-z]+:\/\/[^/]+)\//.exec(formAction)
                           : [ null, hostname ];
      if (!res) return null;
      res = res[1];
    }

    PasswordTags.usernameField = usernameField;
    PasswordTags.passwordField = passwordField;

    return {
      hostname,
      formSubmitURL: res,
      username: usernameField.value,
    };
  },

  fillFormData ({ data: { username, password }}) {
    PasswordTags.usernameField.value = username;
    PasswordTags.passwordField.value = password;
  },
};
