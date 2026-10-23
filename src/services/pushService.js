const axios = require('axios');
const config = require('../config');
const store = require('./pushTokenStore');

/**
 * Sends push notifications through Expo's push service
 * (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Expo forwards to FCM (Android) / APNs (iOS), so the BFF never handles
 * Google/Apple credentials: those are uploaded to EAS once.
 */

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const CHUNK_SIZE = 100; // Expo's limit per request
const RECEIPT_DELAY_MS = 15 * 60 * 1000; // Expo asks for >= 15 min

const http = axios.create({ timeout: 15000 });

function headers() {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(config.push.expoAccessToken
      ? { Authorization: `Bearer ${config.push.expoAccessToken}` }
      : {}),
  };
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function log(...args) {
  // eslint-disable-next-line no-console
  console.log('[push]', ...args);
}

/**
 * @param {number[]} uids  Odoo user ids to notify
 * @param {{title:string, body:string, data?:object, badge?:number}} message
 * @returns {Promise<{devices:number}>}
 */
async function sendToUsers(uids, { title, body, data = {}, badge }) {
  const targets = store.tokensForUids(uids);
  if (!targets.length) return { devices: 0 };

  const messages = targets.map((to) => ({
    to,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
    channelId: 'approvals', // Android channel created by the app
    ...(Number.isInteger(badge) ? { badge } : {}),
  }));

  const receiptIds = [];
  for (const part of chunk(messages, CHUNK_SIZE)) {
    let tickets;
    try {
      const res = await http.post(EXPO_SEND_URL, part, { headers: headers() });
      tickets = res.data?.data || [];
    } catch (err) {
      log('Expo send failed:', err.response?.status || err.message);
      continue;
    }
    const dead = [];
    tickets.forEach((ticket, i) => {
      if (ticket.status === 'ok') {
        if (ticket.id) receiptIds.push(ticket.id);
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        dead.push(part[i].to); // app uninstalled / token revoked
      } else {
        log('ticket error:', ticket.message, ticket.details || '');
      }
    });
    store.removeTokens(dead);
  }

  if (receiptIds.length) {
    setTimeout(() => checkReceipts(receiptIds).catch(() => {}), RECEIPT_DELAY_MS).unref();
  }
  return { devices: targets.length };
}

// Delivery problems that only show up AFTER Expo handed the message to
// FCM/APNs (bad FCM credentials, revoked tokens...) are reported here.
async function checkReceipts(ids) {
  for (const part of chunk(ids, 300)) {
    const res = await http.post(EXPO_RECEIPTS_URL, { ids: part }, { headers: headers() });
    const receipts = res.data?.data || {};
    for (const [id, receipt] of Object.entries(receipts)) {
      if (receipt.status === 'error') {
        log(`receipt ${id}:`, receipt.message, receipt.details || '');
      }
    }
  }
}

module.exports = { sendToUsers };
