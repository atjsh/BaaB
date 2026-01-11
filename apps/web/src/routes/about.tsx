import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/about')({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: 'About - BaaB',
      },
    ],
  }),
  staticData: {
    breadcrumb: 'About',
  },
});

function RouteComponent() {
  return (
    <main className="p-5 max-w-md">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <h2 className=" text-xl font-bold">
            BaaB: End-to-End Encrypted Communication Between Web Browsers Using Web Push API
          </h2>
          <ul className="list-inside flex flex-col gap-2">
            <li className="list-['\1F512_']"> Secure. Only the intended recipients can decrypt and read messages.</li>
            <li className="list-['\1F4AC_']">
              Censorship Resistant. BaaB uses web browser's push services, making it hard to block.
            </li>
            <li className="list-['\26A1_']">
              Instant. No sign-up required. You can host, join and leave sessions anytime.
            </li>
          </ul>
          <a href="https://github.com/atjsh/BaaB" target="_blank" rel="noreferrer" className="underline">
            Source Code
          </a>
        </div>
      </div>
    </main>
  );
}
