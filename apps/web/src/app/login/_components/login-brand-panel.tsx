import { Wrench } from 'lucide-react';
import { LoginPreview } from './login-preview';

export function LoginBrandPanel() {
  return (
    <aside
      className="login-brand hidden flex-col px-10 py-10 text-white lg:flex xl:px-16"
      aria-label="About FieldDesk"
    >
      <div className="flex items-center gap-3 text-xl font-semibold">
        <span className="grid size-11 place-items-center rounded-xl bg-white/15">
          <Wrench className="size-6" aria-hidden="true" />
        </span>
        FieldDesk
      </div>
      <div className="my-auto py-16">
        <h2 className="max-w-md text-5xl leading-[1.15] font-semibold tracking-tight xl:text-6xl">
          Keep field work moving.
        </h2>
        <p className="mt-6 max-w-sm text-base leading-7 text-blue-100">
          Schedule, assign and track maintenance work in one place.
        </p>
        <LoginPreview />
      </div>
      <p className="text-sm text-blue-100">A clearer view of the work ahead.</p>
    </aside>
  );
}
