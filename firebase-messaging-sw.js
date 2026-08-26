/*
 * RA Polymers — Service Worker FCM
 * V2 — leitura robusta do firebase-config.js
 */

importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js',
  './firebase-config.js?v=2'
);

const RA_CONFIG_SW =
  self.RA_POLYMERS_FIREBASE_CONFIG;

if (
  !RA_CONFIG_SW
) {

  throw new Error(
    'RA_POLYMERS_FIREBASE_CONFIG não foi encontrado pelo Service Worker.'
  );

}

firebase.initializeApp(
  RA_CONFIG_SW
);

const messaging =
  firebase.messaging();


/*
 * Mensagens recebidas em segundo plano.
 */
messaging.onBackgroundMessage(
  function(payload) {

    const notification =
      (
        payload &&
        payload.notification
      ) || {};

    const data =
      (
        payload &&
        payload.data
      ) || {};

    const maquina =
      String(
        data.maquina ||
        ''
      ).trim();

    const titulo =
      notification.title ||
      data.title ||
      '🚨 INSPEÇÃO ATRASADA';

    const corpo =
      maquina
        ? (
            'Máquina ' +
            maquina +
            ': ' +
            (
              notification.body ||
              data.body ||
              'Existe uma inspeção atrasada.'
            )
          )
        : (
            notification.body ||
            data.body ||
            'Existe uma inspeção atrasada.'
          );

    return self.registration.showNotification(
      titulo,
      {
        body:
          corpo,

        icon:
          './icons/icon-192.png',

        badge:
          './icons/icon-192.png',

        tag:
          'ra-polymers-inspecao-' +
          (
            maquina ||
            'geral'
          ),

        renotify:
          true,

        requireInteraction:
          true,

        vibrate:
          [
            700,
            300,
            700,
            300,
            1200,
            700,
            1200
          ],

        data:
          {
            url:
              data.url ||
              './',

            maquina:
              maquina,

            tipo:
              data.tipo ||
              'INSPECAO'
          }
      }
    );

  }
);


/*
 * Clique na notificação.
 */
self.addEventListener(
  'notificationclick',
  function(event) {

    event.notification.close();

    const dados =
      event.notification.data ||
      {};

    const destino =
      dados.url ||
      './';

    event.waitUntil(
      clients
        .matchAll(
          {
            type:
              'window',
            includeUncontrolled:
              true
          }
        )
        .then(
          function(clientes) {

            for (
              const cliente
              of clientes
            ) {

              if (
                'focus' in
                cliente
              ) {

                return cliente.focus();

              }

            }

            if (
              clients.openWindow
            ) {

              return clients.openWindow(
                destino
              );

            }

            return null;

          }
        )
    );

  }
);


/*
 * Permite atualização imediata do Service Worker.
 */
self.addEventListener(
  'install',
  function(event) {

    self.skipWaiting();

  }
);

self.addEventListener(
  'activate',
  function(event) {

    event.waitUntil(
      self.clients.claim()
    );

  }
);
