
/*
 * RA Polymers — Service Worker de alarmes
 *
 * Este arquivo precisa ficar na raiz do GitHub Pages.
 */

importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js',
  './firebase-config.js'
);

firebase.initializeApp(
  RA_POLYMERS_FIREBASE_CONFIG
);

const messaging =
  firebase.messaging();

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

    const titulo =
      notification.title ||
      data.title ||
      '🚨 INSPEÇÃO HORÁRIA';

    const corpo =
      notification.body ||
      data.body ||
      'É hora de realizar a inspeção da máquina.';

    const maquina =
      data.maquina ||
      '';

    self.registration.showNotification(
      titulo,
      {
        body:
          maquina
            ? (
                'Máquina ' +
                maquina +
                ': ' +
                corpo
              )
            : corpo,

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


self.addEventListener(
  'notificationclick',
  function(event) {

    event.notification.close();

    const destino =
      (
        event.notification.data &&
        event.notification.data.url
      ) ||
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

          }
        )
    );

  }
);

