import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/chat')({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: 'Chat securely using BaaB',
      },
      {
        title: 'Chat - BaaB',
      },
    ],
  }),
});

function RouteComponent() {
  return <div>Hello "/chat"!</div>;
}
