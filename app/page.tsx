"use client";

import { Button } from "@/components/ui/button";
import useFcmToken from "@/hooks/useFcmToken";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { InAppBrowser } from "@capacitor/inappbrowser";
import { Capacitor } from "@capacitor/core";

const CHECKING = 0;
const AVAILABLE = 1;
const FAILED = 2;

const LOCAL_STORAGE_KEY = "last_used_domain_ub26";

type HealthStatus = typeof CHECKING | typeof AVAILABLE | typeof FAILED;

type DomainConfig = {
  name: string;
  domain: string;
  url: string;
  redirectUrl: string;
  health_check: {
    api: { url: string; status: HealthStatus };
    static: { url: string; status: HealthStatus };
  };
};

const statusMessages = {
  prev: "Checking previously used server",
  searching: "Scanning for fastest server",
  server: "Testing server #",
  found: "Fastest server found!",
  failed: "No reachable server found",
};

const baseDomains: DomainConfig[] = [
  {
    name: "Unlibets",
    domain: "unlibets.app",
    url: "https://unlibets.app",
    redirectUrl: "",
    health_check: {
      api: { url: "https://api.unlibets.app/health.htm", status: CHECKING },
      static: { url: "https://unlibets.app/health.htm", status: CHECKING },
    },
  },
  {
    name: "Unlibets",
    domain: "unlibets.online",
    url: "https://unlibets.online",
    redirectUrl: "",
    health_check: {
      api: { url: "https://api.unlibets.app/health.htm", status: CHECKING },
      static: { url: "https://unlibets.online/health.htm", status: CHECKING },
    },
  },
  {
    name: "Unlibets",
    domain: "unlibets.site",
    url: "https://unlibets.site",
    redirectUrl: "",
    health_check: {
      api: { url: "https://ubapi.site/health.htm", status: CHECKING },
      static: { url: "https://unlibets.site/health.htm", status: CHECKING },
    },
  },
];

const hashes = [
  { hash: "#player", relUrl: "/platform/play" },
  { hash: "#reseller", relUrl: "/reseller/transfer" },
];

function loadStoredDomain() {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!stored) return null;

  try {
    return cloneDomain(JSON.parse(stored) as DomainConfig);
  } catch {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    return null;
  }
}

function buildDomainsForHash() {
  const storedDomain = loadStoredDomain();
  const domains = baseDomains.map(cloneDomain);

  if (
    storedDomain &&
    !domains.some((domain) => domain.url === storedDomain.url)
  ) {
    domains.unshift(storedDomain);
  }

  const match = hashes.find(({ hash }) => hash === window.location.hash);
  return domains.map((domain) => ({
    ...domain,
    redirectUrl: domain.url + (match?.relUrl || ""),
  }));
}

function getAvailabilityStatus(domain: DomainConfig) {
  const apiStatus = domain.health_check.api.status;
  const staticStatus = domain.health_check.static.status;

  if (apiStatus === FAILED || staticStatus === FAILED) return FAILED;
  if (apiStatus === AVAILABLE && staticStatus === AVAILABLE) return AVAILABLE;
  return CHECKING;
}

function statusIcon(status: HealthStatus) {
  if (status === CHECKING) return "fa-spinner fa-pulse text-warning";
  if (status === AVAILABLE) return "fa-circle-check text-success";
  return "fa-circle-xmark text-danger";
}

function cloneDomain(domain: DomainConfig): DomainConfig {
  return {
    ...domain,
    health_check: {
      api: { ...domain.health_check.api, status: CHECKING },
      static: { ...domain.health_check.static, status: CHECKING },
    },
  };
}

export default function Home() {
  const { token, notificationPermissionStatus } = useFcmToken();

  const [domains, setDomains] = useState<DomainConfig[]>([]);
  const [checkerIterationStatus, setCheckerIterationStatus] =
    useState<HealthStatus>(CHECKING);
  const [checkerMessage, setCheckerMessage] = useState(
    statusMessages.searching,
  );
  const [firstAvailableDomain, setFirstAvailableDomain] =
    useState<DomainConfig | null>(null);
  const [showManualRedirect, setShowManualRedirect] = useState(false);
  const initialDomainsRef = useRef<DomainConfig[]>([]);
  const storedDomainRef = useRef<DomainConfig | null>(null);

  const changeStatus = useCallback(
    (message: string, statusNumber: HealthStatus) => {
      setCheckerMessage(message);
      setCheckerIterationStatus(statusNumber);
    },
    [],
  );

  const updateHealthStatus = useCallback(
    (index: number, type: "api" | "static", status: HealthStatus) => {
      setDomains((currentDomains) =>
        currentDomains.map((domain, domainIndex) => {
          if (domainIndex !== index) return domain;

          return {
            ...domain,
            health_check: {
              ...domain.health_check,
              [type]: {
                ...domain.health_check[type],
                status,
              },
            },
          };
        }),
      );
    },
    [],
  );

  const sendRequest = useCallback(
    async (url: string, index: number, type: "api" | "static") => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${url}?t=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        updateHealthStatus(index, type, AVAILABLE);
        return { response, index };
      } catch (exception) {
        updateHealthStatus(index, type, FAILED);
        throw { exception, index };
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [updateHealthStatus],
  );

  const checkDomainIsAvailable = useCallback(
    async (
      index: number,
      currentDomains: DomainConfig[],
    ): Promise<{ index: number }> => {
      for (
        let currentIndex = index;
        currentIndex < currentDomains.length;
        currentIndex += 1
      ) {
        changeStatus(statusMessages.server + (currentIndex + 1), CHECKING);

        try {
          const apiResult = await sendRequest(
            currentDomains[currentIndex].health_check.api.url,
            currentIndex,
            "api",
          );

          return await sendRequest(
            currentDomains[apiResult.index].health_check.static.url,
            apiResult.index,
            "static",
          );
        } catch {
          continue;
        }
      }

      throw new Error("No reachable server found");
    },
    [changeStatus, sendRequest],
  );

  const openInApp = useCallback(async (domain: DomainConfig | null) => {
    if (!domain?.redirectUrl) {
      console.error("No redirect URL available");
      return;
    }

    try {
      // Check if running in Capacitor native environment
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        // ✅ Native environment - use InAppBrowser plugin
        await InAppBrowser.openInWebView({
          url: domain.redirectUrl,
          options: {
            android: {
              isIsolated: false, // Allow interaction with main app
              hardwareBack: true,
              allowZoom: false,
              pauseMedia: false,
            },
            iOS: undefined,
          },
        });
      } else {
        // ✅ Web environment - use window.open or location.assign
        console.log("Opening in web browser:", domain.redirectUrl);
        window.location.assign(domain.redirectUrl);
      }
    } catch (error) {
      console.error("Failed to open URL:", error);
      setShowManualRedirect(true);

      // Fallback: try window.open
      try {
        window.open(domain.redirectUrl, "_blank");
      } catch (fallbackError) {
        console.error("Fallback also failed:", fallbackError);
        // Last resort: show manual redirect button
        setShowManualRedirect(true);
      }
    }
  }, []);

  useEffect(() => {
    const hydratedDomains = buildDomainsForHash();
    storedDomainRef.current = loadStoredDomain();
    initialDomainsRef.current = hydratedDomains;
    setDomains(hydratedDomains);
  }, []);

  useEffect(() => {
    if (!initialDomainsRef.current.length) return;

    let isMounted = true;

    async function findServer() {
      setFirstAvailableDomain(null);
      setShowManualRedirect(false);
      changeStatus(
        storedDomainRef.current
          ? statusMessages.prev
          : statusMessages.searching,
        CHECKING,
      );

      try {
        const data = await checkDomainIsAvailable(0, initialDomainsRef.current);
        if (!isMounted) return;

        const availableDomain = initialDomainsRef.current[data.index];
        setFirstAvailableDomain(availableDomain);
        changeStatus(statusMessages.found, AVAILABLE);
        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify(availableDomain),
        );

        window.setTimeout(() => {
          if (isMounted) openInApp(availableDomain);
        }, 600);
      } catch {
        if (!isMounted) return;
        changeStatus(statusMessages.failed, FAILED);
        setShowManualRedirect(true);
      }
    }

    findServer();

    return () => {
      isMounted = false;
    };
  }, [changeStatus, checkDomainIsAvailable, domains.length, openInApp]);

  const formattedMessage = useMemo(() => {
    if (checkerIterationStatus === CHECKING && checkerMessage.includes("#")) {
      const [prefix, suffix] = checkerMessage.split("#");
      return (
        <>
          {prefix}
          <span className="highlight">#{suffix}</span>
        </>
      );
    }

    return checkerMessage;
  }, [checkerIterationStatus, checkerMessage]);

  const statusBoxClassName = [
    "status-box",
    checkerIterationStatus === AVAILABLE && !checkerMessage.includes("failed")
      ? "status-ready"
      : "",
    checkerIterationStatus === FAILED ? "status-error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleTestNotification = async () => {
    const response = await fetch("/send-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: token,
        title: "Test Notification",
        message: "This is a test notification",
        link: "/contact",
      }),
    });

    const data = await response.json();
    console.log(data);
  };

  return (
    <main className="redirect-page">
      <section className="card" aria-label="UnliBets server finder">
        <div className="logo-wrapper">
          <div className="logo">
            <Image
              src="/ub-logo.png"
              alt="UnliBets"
              width={100}
              height={100}
              priority
            />
          </div>
        </div>

        <div className="subhead">
          <i className="fas fa-bolt" aria-hidden="true" />
          UnliBets server finder
        </div>

        <div className={statusBoxClassName}>
          <div
            className={`status-icon ${
              checkerIterationStatus === CHECKING ? "spin" : ""
            }`}
          >
            {checkerIterationStatus === CHECKING && (
              <i className="fas fa-circle-notch" />
            )}
            {checkerIterationStatus === AVAILABLE && (
              <i className="fas fa-check-circle" />
            )}
            {checkerIterationStatus === FAILED && (
              <i className="fas fa-exclamation-triangle" />
            )}
          </div>

          <div className="status-message">{formattedMessage}</div>

          {checkerIterationStatus === CHECKING && (
            <div className="status-detail">
              <i className="fas fa-hourglass-half" aria-hidden="true" />
              estimating latency
            </div>
          )}

          {checkerIterationStatus === AVAILABLE && firstAvailableDomain && (
            <div className="status-detail">
              <i
                className="fas fa-arrow-right detail-highlight"
                aria-hidden="true"
              />
              connecting to{" "}
              <span className="detail-highlight">
                {firstAvailableDomain.domain}
              </span>
            </div>
          )}

          {checkerIterationStatus === FAILED && (
            <div className="status-detail">
              <i className="fas fa-plug" aria-hidden="true" />
              please select a server below
            </div>
          )}
        </div>

        <div className="domain-grid">
          {domains.map((domain, idx) => {
            const status = getAvailabilityStatus(domain);
            return (
              <button
                type="button"
                key={`${domain.name}-${domain.domain}-${idx}`}
                className={`domain-card ${
                  status === CHECKING ? "domain-checking" : ""
                }`}
                onClick={() => openInApp(domain)}
              >
                <span className="domain-left">
                  <span className="domain-badge">#{idx + 1}</span>
                  <span className="domain-name">
                    {domain.domain || domain.name}
                  </span>
                </span>
                <span className="domain-status-icon">
                  <i className={`fas ${statusIcon(status)}`} />
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={`manual-redirect-btn ${showManualRedirect ? "show" : ""}`}
          onClick={() => openInApp(firstAvailableDomain)}
        >
          <i className="fas fa-arrow-right" aria-hidden="true" />
          Continue to{" "}
          {firstAvailableDomain ? firstAvailableDomain.domain : "server"}
        </button>

        <div className="disclaimer">
          <i className="fas fa-shield-alt" aria-hidden="true" />
          secure &amp; fast ·{" "}
          {firstAvailableDomain && checkerIterationStatus === AVAILABLE ? (
            <>
              active: <strong>{firstAvailableDomain.domain}</strong>
            </>
          ) : (
            "select a server above"
          )}
          <br />
          <span>© UnliBets v1.1 · all rights reserved</span>
        </div>
      </section>
    </main>
  );
}
