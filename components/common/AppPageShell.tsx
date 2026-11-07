import { ReactNode, useRef, useState } from 'react';
import { CSSTransition } from 'react-transition-group';
import TopBar from './TopBar';
import Footer from './Footer';
import AddDomain from '../domains/AddDomain';
import Settings from '../settings/Settings';

type AppPageShellProps = {
   className: string,
   domains: DomainType[],
   version?: string,
   beforeNavigation?: ReactNode,
   renderSidebar: (openAddDomain: () => void) => ReactNode,
   children: ReactNode,
   beforeSettings?: ReactNode,
   afterSettings?: ReactNode,
};

const AppPageShell = ({
   className, domains, version = '', beforeNavigation, renderSidebar, children, beforeSettings, afterSettings,
}: AppPageShellProps) => {
   const [showAddDomain, setShowAddDomain] = useState(false);
   const [showSettings, setShowSettings] = useState(false);
   const addDomainNodeRef = useRef<HTMLDivElement>(null);
   const settingsNodeRef = useRef<HTMLDivElement>(null);
   const openAddDomain = () => setShowAddDomain(true);

   return (
      <div className={className}>
         {beforeNavigation}
         <TopBar showSettings={() => setShowSettings(true)} showAddModal={openAddDomain} />
         <div className="desktop-container flex flex-col gap-6 lg:flex-row lg:gap-10">
            {renderSidebar(openAddDomain)}
            <main className="domain_kewywords w-full min-w-0">
               {children}
            </main>
         </div>
         <CSSTransition in={showAddDomain} timeout={300} classNames="modal_anim" unmountOnExit mountOnEnter nodeRef={addDomainNodeRef}>
            <AddDomain ref={addDomainNodeRef} closeModal={() => setShowAddDomain(false)} domains={domains || []} />
         </CSSTransition>

         {beforeSettings}
         <CSSTransition in={showSettings} timeout={300} classNames="settings_anim" unmountOnExit mountOnEnter nodeRef={settingsNodeRef}>
             <Settings ref={settingsNodeRef} closeSettings={() => setShowSettings(false)} />
         </CSSTransition>
         {afterSettings}
         <Footer currentVersion={version} />
      </div>
   );
};

export default AppPageShell;
