import React from 'react';

export const HowToUse: React.FC = () => {
  const hostname = window.location.hostname;
  return (
    <>
      <div className="bg-gray-200 p-4 flex flex-col gap-2">
        <h4 className=" font-bold text-md">
          If you are using Private Browsing Mode, Incognito Mode, or Secret Mode; Please Don't.
        </h4>
        <p>
          The app won't work properly in Private Browsing Mode, Incognito Mode, or Secret Mode due to following reasons:
        </p>
        <ul className=" list-disc list-inside ">
          <li>
            This app requires you to enable Push Notification and Service Worker features, which are usually disabled in
            such modes.
          </li>
          <li>
            This app uses Local Storage to store necessary data like VAPID keys and subscription information. This app
            won't be able to store such data in these modes.
          </li>
        </ul>
        <p>
          Use <b>normal browsing mode</b> for the best experience.
        </p>
      </div>
      <details open className=" bg-gray-200 p-4 flex flex-col gap-2">
        <summary className=" cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <h3 className=" font-bold text-md">How to use?</h3>
        </summary>
        <div className="flex flex-col gap-2">
          <hr className=" opacity-20" />
          <h4 className=" font-bold text-md">iOS and iPadOS (iPhone and iPad)</h4>
          If you are using iOS or iPadOS: at least iOS/iPadOS 16.4 is required. <br /> BaaB uses Web Push API
          technology. All iOS/iPadOS participants (server and clients) must add the BaaB instance to their home screen
          to enable the technology.
          <ol className=" list-decimal list-inside ">
            <li>
              Open{' '}
              <a href={`https://${hostname}`} target="_blank" rel="noreferrer" className=" underline ">
                this website(https://{hostname}) you are currently visiting
              </a>{' '}
              in Safari.
            </li>
            <li>Tap the "Share" button in the Safari toolbar.</li>
            <li>Tap "Add to Home Screen".</li>
            <li>Open the BaaB instance from the home screen.</li>
          </ol>
          <p>
            Learn more about{' '}
            <a
              href="https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios#iph4f9a47bbc"
              target="_blank"
              rel="noreferrer"
              className=" underline "
            >
              How to add a website to Home Screen
            </a>
            .
          </p>
          <h4 className=" font-bold text-md">macOS</h4>
          If you are using macOS: at least macOS 13 with Safari 16 is required.
          <h4 className=" font-bold text-md">
            Windows, Android, Linux, and others (Desktop Google Chrome, Firefox, etc.)
          </h4>
          The browser with free Web Push API support is required. Examples of such browsers are:
          <ul className=" list-disc list-inside ">
            <li>
              <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer" className=" underline ">
                Google Chrome
              </a>
            </li>
            <li>
              <a href="https://www.microsoft.com/edge" target="_blank" rel="noreferrer" className=" underline ">
                Microsoft Edge
              </a>
            </li>
            <li>
              <a href="https://www.mozilla.org/firefox/" target="_blank" rel="noreferrer" className=" underline ">
                Mozilla Firefox
              </a>
            </li>
          </ul>
          Or, a modern web browser with following features:
          <ol className=" list-decimal list-inside ">
            <li>
              <a
                href="https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API"
                target="_blank"
                rel="noreferrer"
                className=" underline "
              >
                Service Workers API
              </a>
            </li>
            <li>
              <a
                href="https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API"
                target="_blank"
                rel="noreferrer"
                className=" underline "
              >
                Web Notifications API
              </a>
            </li>
            <li>
              <a
                href="https://developer.mozilla.org/en-US/docs/Web/API/Push_API"
                target="_blank"
                rel="noreferrer"
                className=" underline "
              >
                Web Push API
              </a>
            </li>
            <li>
              <a
                href="https://developer.mozilla.org/en-US/docs/Web/API/Storage_API"
                target="_blank"
                rel="noreferrer"
                className=" underline "
              >
                Web Storage API (localStorage)
              </a>
            </li>
          </ol>
          <p>
            Other browsers do work; However, other browsers like Samsung Internet Browser requires developers to
            register a GCM sender ID to use Web Push API.
          </p>
        </div>
      </details>
    </>
  );
};
