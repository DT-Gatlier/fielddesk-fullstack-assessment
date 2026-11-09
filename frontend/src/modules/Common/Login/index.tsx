import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShieldCheck } from "lucide-react"

import { useGetProfileDetails, useLoginWithCredentials } from "@/app/api/queryHooks"
import { ROUTE_CONFIG } from "@/app/router/config"
import LoadingOverlay from "@/app/shared/components/LoadingOverlay"
import { Button } from "@/app/shared/widgets/base/button"
import { Input } from "@/app/shared/widgets/base/input"

import { loginSchema } from "./schema"
import type { LoginFormValues } from "./types"

function Login() {
  const navigate = useNavigate()
  const { data: userInfo, isLoading: isCheckingAuth } = useGetProfileDetails()
  const { mutate: login, isPending: isLoggingIn } = useLoginWithCredentials()

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  const isAuthenticated = !!userInfo?.user?.id

  useEffect(() => {
    if (isAuthenticated) {
      void navigate(ROUTE_CONFIG.dashboard.path, { replace: true })
    }
  }, [isAuthenticated, navigate])

  if (isCheckingAuth) {
    return <LoadingOverlay description="Checking your authentication..." />
  }

  const onSubmit = (data: LoginFormValues) => {
    login({
      email: data.email.trim(),
      password: data.password,
    })
  }

  const handleQuickFill = (email: string) => {
    setValue("email", email, { shouldValidate: true })
    setValue("password", "password123", { shouldValidate: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Card Header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm ring-4 ring-emerald-50">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              FieldDesk
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Multi-Tenant Field Operations & Zero-Trust RBAC Platform
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <Input
                label="Work Email"
                type="email"
                placeholder="name@company.com"
                error={errors.email?.message}
                {...register("email")}
              />
            </div>

            <div>
              <Input
                label="Password"
                type="password"
                placeholder="••••••••••••"
                error={errors.password?.message}
                {...register("password")}
              />
            </div>

            <Button
              type="submit"
              variant="default"
              className="w-full justify-center py-2.5 font-semibold"
              disabled={isSubmitting || isLoggingIn}
            >
              {isLoggingIn ? "Authenticating tenant session..." : "Sign In"}
            </Button>
          </form>

          {/* Quick-Fill Demo Personas */}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Quick Personas (password123)
              </span>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-medium text-slate-500">Org 1 (Apex Services):</div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickFill("owner@apex.test")}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-center text-[11px] font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                >
                  Owner
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill("dispatcher@apex.test")}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-center text-[11px] font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                >
                  Dispatcher
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill("tech1@apex.test")}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-center text-[11px] font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                >
                  Tech 1
                </button>
              </div>

              <div className="pt-1 text-[11px] font-medium text-slate-500">Org 2 (Beacon Systems):</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickFill("owner@beacon.test")}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-center text-[11px] font-medium text-slate-700 hover:border-purple-300 hover:bg-purple-50 transition-colors"
                >
                  Beacon Owner
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill("tech1@beacon.test")}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-center text-[11px] font-medium text-slate-700 hover:border-purple-300 hover:bg-purple-50 transition-colors"
                >
                  Beacon Tech
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400">
          Zero-Trust Multi-Tenancy Architecture • Feature 01 Enforced
        </p>
      </div>
    </div>
  )
}

export default Login
