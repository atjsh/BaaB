import React from 'react';

export const SessionInfo: React.FC = () => {
  return (
    <>
      <div className="bg-gray-100 rounded p-4 flex flex-col gap-2">
        <h4 className="font-bold text-md">You are now connected ✅</h4>
        <p>
          Even when you close the browser, the connection will remain active until you{' '}
          <span className=" text-red-500">explicitly disconnect</span> from the session.
        </p>
      </div>
    </>
  );
};
