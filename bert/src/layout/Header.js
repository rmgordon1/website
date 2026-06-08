import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { usePage } from "../PageContext";

const Header = ({ blog }) => {
  const [sideBarToggle, setSideBarToggle] = useState(false);
  const closeMenu = () => setSideBarToggle(false);
  const { setActive } = usePage();

  const goHome = (e) => {
    if (blog) return;
    e.preventDefault();
    setActive("home");
    closeMenu();
  };

  return (
    <Fragment>
      <header className={`header-top ${sideBarToggle ? "menu-open" : ""}`}>
        <div className="header-top-inner">
          <div className="hl-brand">
            <Link href="/">
              <a className="hl-brand-link" onClick={goHome}>
                <div className="img">
                  <img src="static/img/bert/portrait.jpg" title="" alt="" />
                </div>
                <div className="hl-brand-titles">
                  <span className="brand-name">Robert</span>
                  <span className="brand-tag">DevOps</span>
                </div>
              </a>
            </Link>
          </div>
          <button
            type="button"
            className={`toggler-menu ${sideBarToggle ? "open" : ""}`}
            aria-label="Toggle navigation"
            aria-expanded={sideBarToggle}
            onClick={() => setSideBarToggle(!sideBarToggle)}
          >
            <span />
            <span />
            <span />
          </button>
          <nav className="header-top-nav" aria-label="Primary">
            {blog ? (
              <MenuWithBlog onNavigate={closeMenu} />
            ) : (
              <MenuWithOutBlog onNavigate={closeMenu} />
            )}
          </nav>
        </div>
      </header>
    </Fragment>
  );
};
export default Header;

const NAV_ITEMS = [
  { id: "home", icon: "ti-home", label: "Home" },
  { id: "about", icon: "ti-id-badge", label: "About Me" },
  { id: "services", icon: "ti-panel", label: "Services" },
  { id: "work", icon: "ti-bookmark-alt", label: "Portfolio" },
  { id: "contactus", icon: "ti-map-alt", label: "Contact Me" },
];

const MenuWithOutBlog = ({ onNavigate }) => {
  const { active, setActive } = usePage();

  const handleClick = (e, id) => {
    e.preventDefault();
    setActive(id);
    if (onNavigate) onNavigate();
  };

  return (
    <ul className="nav nav-menu" id="pp-menu">
      {NAV_ITEMS.map((item) => (
        <li
          key={item.id}
          data-menuanchor={item.id}
          className={active === item.id ? "active" : ""}
        >
          <a
            className="nav-link"
            href={`#${item.id}`}
            onClick={(e) => handleClick(e, item.id)}
          >
            <i className={item.icon} />
            <span>{item.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
};

const MenuWithBlog = ({ onNavigate }) => {
  useEffect(() => {
    const el = document.querySelector(".blog");
    if (!el) return undefined;
    const onScroll = () => el.classList.add("active");
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Fragment>
      <ul className="nav nav-menu" id="pp-menu">
        {NAV_ITEMS.map((item) => (
          <li key={item.id} data-menuanchor={item.id}>
            <Link href={`/#${item.id}`}>
              <a className="nav-link" onClick={onNavigate}>
                <i className={item.icon} />
                <span>{item.label}</span>
              </a>
            </Link>
          </li>
        ))}
      </ul>
    </Fragment>
  );
};
