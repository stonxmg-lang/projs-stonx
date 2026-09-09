package com.stonx.bot;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Talks to the bot's local control API (src/api/server.js in the Node
 * project), which listens on 127.0.0.1 only. Every method here is
 * synchronous/blocking — always call from a background thread, never the
 * UI thread.
 */
public final class ApiClient {

    public static final String BASE_URL = "http://127.0.0.1:7377";

    private ApiClient() {}

    public static class ApiException extends Exception {
        public final int statusCode;
        public ApiException(String message, int statusCode) {
            super(message);
            this.statusCode = statusCode;
        }
    }

    public static JSONObject getJson(String path) throws IOException, ApiException {
        HttpURLConnection conn = open(path, "GET");
        try {
            return readJson(conn);
        } finally {
            conn.disconnect();
        }
    }

    public static JSONObject postJson(String path, JSONObject body) throws IOException, ApiException {
        HttpURLConnection conn = open(path, "POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        byte[] payload = (body == null ? new JSONObject() : body).toString().getBytes(StandardCharsets.UTF_8);
        conn.setFixedLengthStreamingMode(payload.length);
        try (OutputStream out = conn.getOutputStream()) {
            out.write(payload);
        }
        try {
            return readJson(conn);
        } finally {
            conn.disconnect();
        }
    }

    /** Returns null if no QR is available yet (HTTP 404) instead of throwing. */
    public static byte[] getQrPng() throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(BASE_URL + "/api/qr.png").openConnection();
        conn.setConnectTimeout(4000);
        conn.setReadTimeout(4000);
        try {
            int code = conn.getResponseCode();
            if (code != 200) return null;
            return readAll(conn.getInputStream());
        } finally {
            conn.disconnect();
        }
    }

    private static HttpURLConnection open(String path, String method) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(BASE_URL + path).openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(4000);
        conn.setReadTimeout(4000);
        return conn;
    }

    private static JSONObject readJson(HttpURLConnection conn) throws IOException, ApiException {
        int code = conn.getResponseCode();
        InputStream stream = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        String text = stream == null ? "{}" : new String(readAll(stream), StandardCharsets.UTF_8);
        try {
            JSONObject json = new JSONObject(text);
            if (code < 200 || code >= 300) {
                throw new ApiException(json.optString("error", "HTTP " + code), code);
            }
            return json;
        } catch (org.json.JSONException e) {
            throw new ApiException("bad response: " + text, code);
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int n;
        while ((n = in.read(chunk)) != -1) buffer.write(chunk, 0, n);
        return buffer.toByteArray();
    }
}
