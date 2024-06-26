"use strict";

/* eslint-disable mozilla/no-comparison-or-assignment-inside-ok */

SimpleTest.waitForExplicitFinish();

var gen = runTests();
function continueTest() {
  gen.next();
}

function* runTests() {
  var expectHttp2Results = location.href.includes("http2");

  var path = "/tests/dom/xhr/tests/";

  var passFiles = [
    ["file_XHR_pass1.xml", "GET", 200, "OK", "text/xml"],
    ["file_XHR_pass2.txt", "GET", 200, "OK", "text/plain"],
    ["file_XHR_pass3.txt", "GET", 200, "OK", "text/plain"],
    ["data:text/xml,%3Cres%3Ehello%3C/res%3E%0A", "GET", 200, "OK", "text/xml"],
    ["data:text/plain,hello%20pass%0A", "GET", 200, "OK", "text/plain"],
    ["data:,foo", "GET", 200, "OK", "text/plain;charset=US-ASCII", "foo"],
    ["data:text/plain;base64,Zm9v", "GET", 200, "OK", "text/plain", "foo"],
    ["data:text/plain,foo#bar", "GET", 200, "OK", "text/plain", "foo"],
    ["data:text/plain,foo%23bar", "GET", 200, "OK", "text/plain", "foo#bar"],
  ];

  var blob = new Blob(["foo"], { type: "text/plain" });
  var blobURL = URL.createObjectURL(blob);

  passFiles.push([blobURL, "GET", 200, "OK", "text/plain", "foo"]);

  var failFiles = [
    ["//example.com" + path + "file_XHR_pass1.xml", "GET"],
    ["ftp://localhost" + path + "file_XHR_pass1.xml", "GET"],
    ["file_XHR_fail1.txt", "GET"],
  ];

  for (i = 0; i < passFiles.length; ++i) {
    // Function to give our hacked is() a scope
    (function (oldIs) {
      function is(actual, expected, message) {
        oldIs(actual, expected, message + " for " + passFiles[i][0]);
      }
      xhr = new XMLHttpRequest();
      is(xhr.getResponseHeader("Content-Type"), null, "should be null");
      is(xhr.getAllResponseHeaders(), "", "should be empty string");
      is(xhr.responseType, "", "wrong initial responseType");
      xhr.open(passFiles[i][1], passFiles[i][0], false);
      xhr.send(null);
      is(xhr.status, passFiles[i][2], "wrong status");

      // over HTTP2, no status text is received for network requests (but
      // data/blob URLs default to "200 OK" responses)
      let expectedStatusText = passFiles[i][3];
      if (
        expectHttp2Results &&
        !passFiles[i][0].startsWith("data:") &&
        !passFiles[i][0].startsWith("blob:")
      ) {
        expectedStatusText = "";
      }
      is(xhr.statusText, expectedStatusText, "wrong statusText");

      is(
        xhr.getResponseHeader("Content-Type"),
        passFiles[i][4],
        "wrong content type"
      );
      var headers = xhr.getAllResponseHeaders();
      ok(
        /(?:^|\n)Content-Type:\s*([^\r\n]*)\r\n/i.test(headers) &&
          RegExp.$1 === passFiles[i][4],
        "wrong response headers"
      );
      if (xhr.responseXML) {
        is(
          new XMLSerializer().serializeToString(
            xhr.responseXML.documentElement
          ),
          passFiles[i][5] || "<res>hello</res>",
          "wrong responseXML"
        );
        is(
          xhr.response,
          passFiles[i][5] || "<res>hello</res>\n",
          "wrong response"
        );
      } else {
        is(
          xhr.responseText,
          passFiles[i][5] || "hello pass\n",
          "wrong responseText"
        );
        is(xhr.response, passFiles[i][5] || "hello pass\n", "wrong response");
      }
    })(is);
  }

  URL.revokeObjectURL(blobURL);

  for (i = 0; i < failFiles.length; ++i) {
    xhr = new XMLHttpRequest();
    let didthrow = false;
    try {
      xhr.open(failFiles[i][1], failFiles[i][0], false);
      xhr.send(null);
    } catch (e) {
      didthrow = true;
    }
    if (!didthrow) {
      is(xhr.status, 301, "wrong status");
      is(xhr.responseText, "redirect file\n", "wrong response");
    } else {
      ok(1, "should have thrown or given incorrect result");
    }
  }

  function checkResponseTextAccessThrows(xhr) {
    let didthrow = false;
    try {
      xhr.responseText;
    } catch (e) {
      didthrow = true;
    }
    ok(didthrow, "should have thrown when accessing responseText");
  }
  function checkResponseXMLAccessThrows(xhr) {
    let didthrow = false;
    try {
      xhr.responseXML;
    } catch (e) {
      didthrow = true;
    }
    ok(didthrow, "should have thrown when accessing responseXML");
  }
  function checkSetResponseType(xhr, type) {
    let didthrow = false;
    try {
      xhr.responseType = type;
    } catch (e) {
      didthrow = true;
    }
    is(xhr.responseType, type, "responseType should be " + type);
    ok(!didthrow, "should not have thrown when setting responseType");
  }
  function checkSetResponseTypeThrows(xhr, type) {
    let didthrow = false;
    try {
      xhr.responseType = type;
    } catch (e) {
      didthrow = true;
    }
    ok(didthrow, "should have thrown when setting responseType");
  }
  function checkOpenThrows(xhr, method, url, async) {
    let didthrow = false;
    try {
      xhr.open(method, url, async);
    } catch (e) {
      didthrow = true;
    }
    ok(didthrow, "should have thrown when open is called");
  }

  // test if setting responseType before calling open() works
  xhr = new XMLHttpRequest();
  checkSetResponseType(xhr, "");
  checkSetResponseType(xhr, "text");
  checkSetResponseType(xhr, "document");
  checkSetResponseType(xhr, "arraybuffer");
  checkSetResponseType(xhr, "blob");
  checkSetResponseType(xhr, "json");
  checkOpenThrows(xhr, "GET", "file_XHR_pass2.txt", false);

  // test response (sync, responseType is not changeable)
  xhr = new XMLHttpRequest();
  xhr.open("GET", "file_XHR_pass2.txt", false);
  checkSetResponseTypeThrows(xhr, "");
  checkSetResponseTypeThrows(xhr, "text");
  checkSetResponseTypeThrows(xhr, "document");
  checkSetResponseTypeThrows(xhr, "arraybuffer");
  checkSetResponseTypeThrows(xhr, "blob");
  checkSetResponseTypeThrows(xhr, "json");
  xhr.send(null);
  checkSetResponseTypeThrows(xhr, "document");
  is(xhr.status, 200, "wrong status");
  is(xhr.response, "hello pass\n", "wrong response");

  // test response (responseType='document')
  xhr = new XMLHttpRequest();
  xhr.open("GET", "file_XHR_pass1.xml");
  xhr.responseType = "document";
  xhr.onloadend = continueTest;
  xhr.send(null);
  yield undefined;
  checkSetResponseTypeThrows(xhr, "document");
  is(xhr.status, 200, "wrong status");
  checkResponseTextAccessThrows(xhr);
  is(
    new XMLSerializer().serializeToString(xhr.response.documentElement),
    "<res>hello</res>",
    "wrong response"
  );

  // test response (responseType='text')
  xhr = new XMLHttpRequest();
  xhr.open("GET", "file_XHR_pass2.txt");
  xhr.responseType = "text";
  xhr.onloadend = continueTest;
  xhr.send(null);
  yield undefined;
  is(xhr.status, 200, "wrong status");
  checkResponseXMLAccessThrows(xhr);
  is(xhr.response, "hello pass\n", "wrong response");

  // test response (responseType='arraybuffer')
  function arraybuffer_equals_to(ab, s) {
    is(ab.byteLength, s.length, "wrong arraybuffer byteLength");

    var u8v = new Uint8Array(ab);
    is(String.fromCharCode.apply(String, u8v), s, "wrong values");
  }

  // with a simple text file
  xhr = new XMLHttpRequest();
  xhr.open("GET", "file_XHR_pass2.txt");
  xhr.responseType = "arraybuffer";
  xhr.onloadend = continueTest;
  xhr.send(null);
  yield undefined;
  is(xhr.status, 200, "wrong status");
  checkResponseTextAccessThrows(xhr);
  checkResponseXMLAccessThrows(xhr);
  var ab = xhr.response;
  ok(ab != null, "should have a non-null arraybuffer");
  arraybuffer_equals_to(ab, "hello pass\n");

  // test reusing the same XHR (Bug 680816)
  xhr.open("GET", "file_XHR_binary1.bin");
  xhr.responseType = "arraybuffer";
  xhr.onloadend = continueTest;
  xhr.send(null);
  yield undefined;
  is(xhr.status, 200, "wrong status");
  var ab2 = xhr.response;
  ok(ab2 != null, "should have a non-null arraybuffer");
  ok(ab2 != ab, "arraybuffer on XHR reuse should be distinct");
  arraybuffer_equals_to(ab, "hello pass\n");
  arraybuffer_equals_to(ab2, "\xaa\xee\0\x03\xff\xff\xff\xff\xbb\xbb\xbb\xbb");

  // with a binary file
  xhr = new XMLHttpRequest();
  xhr.open("GET", "file_XHR_binary1.bin");
  xhr.responseType = "arraybuffer";
  xhr.onloadend = continueTest;
  xhr.send(null);
  yield undefined;
  is(xhr.status, 200, "wrong status");
  checkResponseTextAccessThrows(xhr);
  checkResponseXMLAccessThrows(xhr);
  ab = xhr.response;
  ok(ab != null, "should have a non-null arraybuffer");
  arraybuffer_equals_to(ab, "\xaa\xee\0\x03\xff\xff\xff\xff\xbb\xbb\xbb\xbb");
  is(xhr.response, xhr.response, "returns the same ArrayBuffer");

  // test response (responseType='json')
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "responseIdentical.sjs");
  xhr.responseType = "json";
  var jsonObjStr = JSON.stringify({ title: "aBook", author: "john" });
  xhr.onloadend = continueTest;
  xhr.send(jsonObjStr);
  yield undefined;
  is(xhr.status, 200, "wrong status");
  checkResponseTextAccessThrows(xhr);
  checkResponseXMLAccessThrows(xhr);
  is(JSON.stringify(xhr.response), jsonObjStr, "correct result");
  is(xhr.response, xhr.response, "returning the same object on each access");

  // with invalid json
  xhr = new XMLHttpRequest();
  xhr.open("POST", "responseIdentical.sjs");
  xhr.responseType = "json";
  xhr.onloadend = continueTest;
  xhr.send("{");
  yield undefined;
  is(xhr.status, 200, "wrong status");
  checkResponseTextAccessThrows(xhr);
  checkResponseXMLAccessThrows(xhr);
  is(xhr.response, null, "Bad JSON should result in null response.");
  is(
    xhr.response,
    null,
    "Bad JSON should result in null response even 2nd time."
  );

  // Test status/statusText in all readyStates
  xhr = new XMLHttpRequest();
  function checkXHRStatus() {
    if (xhr.readyState == xhr.UNSENT || xhr.readyState == xhr.OPENED) {
      is(xhr.status, 0, "should be 0 before getting data");
      is(xhr.statusText, "", "should be empty before getting data");
    } else {
      is(xhr.status, 200, "should be 200 when we have data");
      if (expectHttp2Results) {
        is(xhr.statusText, "", "should be '' when over HTTP2");
      } else {
        is(xhr.statusText, "OK", "should be OK when we have data");
      }
    }
  }
  checkXHRStatus();
  xhr.open("GET", "file_XHR_binary1.bin");
  checkXHRStatus();
  xhr.responseType = "arraybuffer";
  xhr.send(null);
  xhr.onreadystatechange = continueTest;
  while (xhr.readyState != 4) {
    checkXHRStatus();
    yield undefined;
  }
  checkXHRStatus();

  // test response (responseType='blob')
  // with a simple text file
  xhr = new XMLHttpRequest();
  xhr.open("GET", "file_XHR_pass2.txt");
  xhr.responseType = "blob";
  xhr.onloadend = continueTest;
  xhr.send(null);
  yield undefined;
  is(xhr.status, 200, "wrong status");
  checkResponseTextAccessThrows(xhr);
  checkResponseXMLAccessThrows(xhr);
  var b = xhr.response;
  ok(b, "should have a non-null blob");
  ok(b instanceof Blob, "should be a Blob");
  ok(!(b instanceof File), "should not be a File");
  is(b.size, "hello pass\n".length, "wrong blob size");

  var fr = new FileReader();
  fr.onload = continueTest;
  fr.readAsBinaryString(b);
  yield undefined;
  is(fr.result, "hello pass\n", "wrong values");

  // with a binary file
  xhr = new XMLHttpRequest();
  xhr.open("GET", "file_XHR_binary1.bin", true);
  xhr.send(null);
  xhr.onreadystatechange = continueTest;
  while (xhr.readyState != 2) {
    yield undefined;
  }

  is(xhr.status, 200, "wrong status");
  xhr.responseType = "blob";

  while (xhr.readyState != 4) {
    yield undefined;
  }

  xhr.onreadystatechange = null;

  b = xhr.response;
  ok(b != null, "should have a non-null blob");
  is(b.size, 12, "wrong blob size");

  fr = new FileReader();
  fr.readAsBinaryString(b);
  xhr = null; // kill the XHR object
  b = null;
  SpecialPowers.gc();
  fr.onload = continueTest;
  yield undefined;
  is(
    fr.result,
    "\xaa\xee\0\x03\xff\xff\xff\xff\xbb\xbb\xbb\xbb",
    "wrong values"
  );

  // with a larger binary file
  xhr = new XMLHttpRequest();
  xhr.open("GET", "file_XHR_binary2.bin", true);
  xhr.responseType = "blob";
  xhr.send(null);
  xhr.onreadystatechange = continueTest;

  while (xhr.readyState != 4) {
    yield undefined;
  }

  xhr.onreadystatechange = null;

  b = xhr.response;
  ok(b != null, "should have a non-null blob");
  is(b.size, 65536, "wrong blob size");

  fr = new FileReader();
  fr.readAsArrayBuffer(b);
  fr.onload = continueTest;
  xhr = null; // kill the XHR object
  b = null;
  SpecialPowers.gc();
  yield undefined;

  var u8 = new Uint8Array(fr.result);
  for (var i = 0; i < 65536; i++) {
    if (u8[i] !== (i & 255)) {
      break;
    }
  }
  is(i, 65536, "wrong value at offset " + i);

  var client = new XMLHttpRequest();
  client.open("GET", "file_XHR_pass1.xml", true);
  client.send();
  client.onreadystatechange = function () {
    if (client.readyState == 4) {
      try {
        is(client.responseXML, null, "responseXML should be null.");
        is(client.responseText, "", "responseText should be empty string.");
        is(client.response, "", "response should be empty string.");
        is(client.status, 0, "status should be 0.");
        is(client.statusText, "", "statusText should be empty string.");
        is(
          client.getAllResponseHeaders(),
          "",
          "getAllResponseHeaders() should return empty string."
        );
      } catch (ex) {
        ok(false, "Shouldn't throw! [" + ex + "]");
      }
    }
  };
  client.abort();

  SimpleTest.finish();
} /* runTests */
