// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.2.3.7-6-a-255
description: >
    Object.defineProperties - 'O' is an Array, 'P' is an array index
    named property that already exists on 'O' is accessor property and
    'desc' is accessor descriptor, test setting the [[Get]] attribute
    value of 'P' as undefined  (15.4.5.1 step 4.c)
includes: [propertyHelper.js]
---*/


var arr = [];

Object.defineProperty(arr, "0", {
  get: function() {
    return 12;
  },
  configurable: true
});

Object.defineProperties(arr, {
  "0": {
    get: undefined
  }
});

verifyProperty(arr, "0", {
  enumerable: false,
  configurable: true,
});

reportCompare(0, 0);
