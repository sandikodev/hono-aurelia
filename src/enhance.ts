/**
 * @hono/aurelia/client Progressive Form Enhancement (`au-enhance`)
 *
 * Pure Web-Standards Aurelia 2 Custom Attribute intercepting `<form method="POST">`
 * submissions when JavaScript is active while preserving native HTML PRG fallback
 * when JavaScript is disabled or unavailable.
 */

import {
  DI,
  INode,
  optional,
  resolve,
  type ICustomAttributeViewModel,
  type IResolver,
} from 'aurelia';

export interface ClientNavigatorController {
  readonly currentInstance: object | null;
  readonly currentUrl: string;
  navigate(url: string, options?: { replace?: boolean }): Promise<object | null>;
  invalidate(url?: string): Promise<void>;
  preload(url: string): Promise<void>;
  dispose(): void;
}

export const IAureliaClientNavigator: IResolver<ClientNavigatorController> =
  /*@__PURE__*/ DI.createInterface<ClientNavigatorController>(
    'IAureliaClientNavigator'
  ) as unknown as IResolver<ClientNavigatorController>;

export function resolveClientNavigator(): ClientNavigatorController {
  return resolve(IAureliaClientNavigator);
}

export interface EnhanceSubmitContext {
  readonly form: HTMLFormElement;
  readonly formData: FormData;
  readonly actionUrl: URL;
  readonly method: string;
  readonly submitter: HTMLElement | null;
  cancel(): void;
}

export interface EnhanceResultContext {
  readonly form: HTMLFormElement;
  readonly actionUrl: URL;
  readonly response?: Response;
  readonly status: number;
  readonly ok: boolean;
  readonly redirected: boolean;
  readonly data: unknown;
  readonly error?: unknown;
  update(options?: { reset?: boolean; invalidate?: boolean }): Promise<void>;
}

export type EnhanceAfterSubmit = (ctx: EnhanceResultContext) => void | Promise<void>;
export type EnhanceSubmitHook = (
  ctx: EnhanceSubmitContext
) => void | EnhanceAfterSubmit | Promise<void | EnhanceAfterSubmit>;

export class AuEnhanceCustomAttribute implements ICustomAttributeViewModel {
  public static readonly $au = {
    type: 'custom-attribute',
    name: 'au-enhance',
    bindables: ['onSubmit', 'reset', 'invalidate'],
    defaultProperty: 'onSubmit',
  } as const;

  public onSubmit?: EnhanceSubmitHook | '';
  public reset?: boolean;
  public invalidate?: boolean;

  private readonly host = resolve(INode) as HTMLFormElement;
  private readonly navigator = resolve(optional(IAureliaClientNavigator));
  private readonly handleSubmit = (event: Event): void => {
    void this.processSubmit(event as SubmitEvent);
  };

  public attached(): void {
    if (this.host && typeof this.host.addEventListener === 'function') {
      this.host.addEventListener('submit', this.handleSubmit);
    }
  }

  public detaching(): void {
    if (this.host && typeof this.host.removeEventListener === 'function') {
      this.host.removeEventListener('submit', this.handleSubmit);
    }
  }

  private async processSubmit(event: SubmitEvent): Promise<void> {
    const form = this.host;
    if (!form || form.tagName?.toUpperCase() !== 'FORM') return;

    const method = (
      event.submitter?.getAttribute('formmethod') ||
      form.getAttribute('method') ||
      'POST'
    ).toUpperCase();

    if (method === 'DIALOG') return;

    const rawAction =
      event.submitter?.getAttribute('formaction') ||
      form.getAttribute('action') ||
      (typeof window !== 'undefined' ? window.location.href : 'http://localhost/');

    const baseHref =
      form.ownerDocument?.baseURI ||
      (typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
    const actionUrl = new URL(rawAction, baseHref);

    const formData = new FormData(form);
    const submitter = (event.submitter as HTMLElement | null) ?? null;
    if (submitter && 'name' in submitter) {
      const subName = submitter.getAttribute('name');
      const subVal = submitter.getAttribute('value') ?? '';
      if (subName && !formData.has(subName)) {
        formData.append(subName, subVal);
      }
    }

    let cancelled = false;
    const submitCtx: EnhanceSubmitContext = {
      form,
      formData,
      actionUrl,
      method,
      submitter,
      cancel() {
        cancelled = true;
      },
    };

    event.preventDefault();

    let afterCallback: EnhanceAfterSubmit | undefined;
    if (typeof this.onSubmit === 'function') {
      const hookResult = await this.onSubmit(submitCtx);
      if (typeof hookResult === 'function') {
        afterCallback = hookResult;
      }
    }

    if (cancelled) {
      return;
    }

    form.setAttribute('data-au-submitting', 'true');

    const runDefaultUpdate = async (
      response: Response | undefined,
      opts?: { reset?: boolean; invalidate?: boolean }
    ): Promise<void> => {
      const shouldReset = opts?.reset ?? (this.reset !== false);
      const shouldInvalidate = opts?.invalidate ?? (this.invalidate !== false);

      if (response?.redirected && response.url) {
        if (this.navigator) {
          await this.navigator.navigate(response.url);
        } else if (typeof window !== 'undefined') {
          window.location.assign(response.url);
        }
        return;
      }

      if (response?.ok && shouldReset && typeof form.reset === 'function') {
        form.reset();
      }

      if (response?.ok && shouldInvalidate && this.navigator) {
        await this.navigator.invalidate();
      }
    };

    try {
      const fetchInit: RequestInit = {
        method,
        headers: {
          Accept: 'application/json',
          'X-Aurelia-Enhance': '1',
        },
        redirect: 'follow',
      };

      if (method === 'GET' || method === 'HEAD') {
        for (const [key, val] of formData.entries()) {
          if (typeof val === 'string') {
            actionUrl.searchParams.append(key, val);
          }
        }
      } else {
        fetchInit.body = formData;
      }

      const response = await fetch(actionUrl.toString(), fetchInit);
      const contentType = response.headers.get('content-type') ?? '';
      const rawBody = await response.text();
      const data: unknown =
        contentType.includes('application/json') && rawBody.length > 0
          ? JSON.parse(rawBody)
          : rawBody;

      if (afterCallback) {
        await afterCallback({
          form,
          actionUrl,
          response,
          status: response.status,
          ok: response.ok,
          redirected: response.redirected,
          data,
          update: (opts) => runDefaultUpdate(response, opts),
        });
      } else {
        await runDefaultUpdate(response);
      }
    } catch (error) {
      if (afterCallback) {
        await afterCallback({
          form,
          actionUrl,
          status: 0,
          ok: false,
          redirected: false,
          data: undefined,
          error,
          update: async () => {},
        });
      } else {
        throw error;
      }
    } finally {
      form.removeAttribute('data-au-submitting');
    }
  }
}

export const EnhanceConfiguration = {
  register(container: { register: (...args: unknown[]) => unknown }) {
    container.register(AuEnhanceCustomAttribute);
  },
};
