import ImageView from "../components/ImageView";
import { PageProvider } from "../PageContext";
import BackBtn from "./BackBtn";
import Header from "./Header";
const Layout = ({ children, blog }) => {
  return (
    <PageProvider>
      <ImageView />
      {/* page loading */}
      {/* End */}
      {/* Header Start */}
      {/* <Header blog={blog} /> */}
      {/* Main Start */}
      <main className="main-left pp-main-section">{children}</main>
      {blog && <BackBtn />}
    </PageProvider>
  );
};
export default Layout;
