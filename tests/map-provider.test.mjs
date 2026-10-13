import { test } from "node:test";
import assert from "node:assert/strict";
import { readMapProvider, drawnProvider, tileParam, attribution } from "../src/lib/map-provider.ts";

test("Google unless Mapbox was picked", () => {
  assert.equal(readMapProvider(undefined), "google");
  assert.equal(readMapProvider(null), "google");
  assert.equal(readMapProvider("bing"), "google");
  assert.equal(readMapProvider("mapbox"), "mapbox");
});

test("falls back to Mapbox when Google is off, and while clipping", () => {
  assert.equal(drawnProvider("google", true, false), "google");
  assert.equal(drawnProvider("google", false, false), "mapbox");
  assert.equal(drawnProvider("google", true, true), "mapbox");
  assert.equal(drawnProvider("mapbox", true, false), "mapbox");
});

test("tile params", () => {
  assert.equal(tileParam("google", "map"), "google-map");
  assert.equal(tileParam("google", "sat"), "google-sat");
  assert.equal(tileParam("mapbox", "map"), "streets");
  assert.equal(tileParam("mapbox", "sat"), "mapbox");
});

test("attribution", () => {
  assert.equal(attribution("mapbox", "sat"), "© Mapbox © OpenStreetMap © Maxar");
  assert.equal(attribution("google", "map", "Map data ©2026 Google"), "Google · Map data ©2026 Google");
  assert.equal(attribution("google", "sat", ""), "Google · Imagery ©Google");
});
