import React from 'react';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';

export const AppShellLayout = ({ children }) => {
  return (
    <div className="app-shell-canvas flex h-screen w-full overflow-hidden">
      <Sidebar />

      <div className="ml-[280px] flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-w-0 flex-1 overflow-y-auto px-6 pb-8 pt-6 md:px-8">
          <div className="mx-auto max-w-[1440px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
