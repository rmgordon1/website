import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { activeSection } from "../utilits";

const Header = ({ blog }) => {
  const [sideBarToggle, setSideBarToggle] = useState(false);
  const closeMenu = () => setSideBarToggle(false);

  useEffect(() => {
    if (!blog) {
      activeSection();
    }
  }, [blog]);

  return (
    <Fragment>
      <header className={`header-top ${sideBarToggle ? "menu-open" : ""}`}>
        <div className="header-top-inner">
          <div className="hl-brand">
            <Link href="/">
              <a className="hl-brand-link" onClick={closeMenu}>
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

const MenuWithOutBlog = ({ onNavigate }) => {
  return (
    <ul className="nav nav-menu" id="pp-menu">
      <li data-menuanchor="home" className="active">
        <a className="nav-link" href="#home" onClick={onNavigate}>
          <i className="ti-home" />
          <span>Home</span>
        </a>
      </li>
      <li data-menuanchor="about">
        <a className="nav-link" href="#about" onClick={onNavigate}>
          <i className="ti-id-badge" />
          <span>About Me</span>
        </a>
      </li>
      <li data-menuanchor="services">
        <a className="nav-link" href="#services" onClick={onNavigate}>
          <i className="ti-panel" />
          <span>Services</span>
        </a>
      </li>
      <li data-menuanchor="work">
        <a className="nav-link" href="#work" onClick={onNavigate}>
          <i className="ti-bookmark-alt" />
          <span>Portfolio</span>
        </a>
      </li>
      <li data-menuanchor="contactus">
        <a className="nav-link" href="#contactus" onClick={onNavigate}>
          <i className="ti-map-alt" />
          <span>Contact Me</span>
        </a>
      </li>
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
        <li data-menuanchor="home">
          <Link href="/#home">
            <a className="nav-link" onClick={onNavigate}>
              <i className="ti-home" />
              <span>Home</span>
            </a>
          </Link>
        </li>
        <li data-menuanchor="about">
          <Link href="/#about">
            <a className="nav-link" onClick={onNavigate}>
              <i className="ti-id-badge" />
              <span>About Me</span>
            </a>
          </Link>
        </li>
        <li data-menuanchor="services">
          <Link href="/#services">
            <a className="nav-link" onClick={onNavigate}>
              <i className="ti-panel" />
              <span>Services</span>
            </a>
          </Link>
        </li>
        <li data-menuanchor="work">
          <Link href="/#work">
            <a className="nav-link" onClick={onNavigate}>
              <i className="ti-bookmark-alt" />
              <span>Portfolio</span>
            </a>
          </Link>
        </li>
        <li data-menuanchor="contactus">
          <Link href="/#contactus">
            <a className="nav-link" onClick={onNavigate}>
              <i className="ti-map-alt" />
              <span>Contact Me</span>
            </a>
          </Link>
        </li>
      </ul>
    </Fragment>
  );
};
