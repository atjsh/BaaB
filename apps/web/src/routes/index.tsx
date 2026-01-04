import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
  head: () => ({
    meta: [
      {
        title: 'Welcome - BaaB',
      },
    ],
  }),
});

function Index() {
  return (
    <main className="p-5 max-w-md">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <h2 className=" text-xl font-bold">
            End-to-End Encrypted Communication Between Web Browsers Using Web Push API
          </h2>
          <ul className="list-inside">
            <li className="list-['\1F512_']"> Secure. Only the intended recipients can decrypt and read messages.</li>
            <li className="list-['\1F4AC_']">
              {' '}
              Censorship Resistant. BaaB uses web browser's push services, making it hard to block.
            </li>
            <li className="list-['\26A1_']">
              {' '}
              Instant. No sign-up required. You can host, join and leave sessions anytime.
            </li>
          </ul>
          <p>Try it out:</p>
          <ul className=" flex flex-row gap-4 list-none p-0 m-0">
            <li>
              <Link to="/share" className="underline">
                Share Images and Files
              </Link>
            </li>
            <li>or</li>
            <li>
              <Link to="/chat" className="underline">
                New Chat
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
