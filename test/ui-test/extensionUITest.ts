import { expect } from 'chai';
import {
  ActivityBar,
  SideBarView,
  ViewControl,
  ExtensionsViewSection,
} from 'vscode-extension-tester';

/**
 * @author Ondrej Dockal <odockal@redhat.com>
 */
export function extensionUIAssetsTest(): void {
  describe('Verify base assets are available after installation', () => {
    let view: ViewControl;
    let sideBar: SideBarView;

    before(async function () {
      this.timeout(6000);
      view = (await new ActivityBar().getViewControl(
        'Extensions'
      )) as ViewControl;
      sideBar = await view.openView();
    });

    it('VSCode Ansible extension is installed', async function () {
      this.retries(3);
      this.timeout(20000); // even 18s failed
      const section = (await sideBar
        .getContent()
        .getSection('Installed')) as ExtensionsViewSection;
      const item = await section.findItem('@installed Ansible');
      expect(item, 'Failed to find Ansible extension').not.undefined;
      expect(await item?.getText()).to.contain('Red Hat');
    });

    after(async function () {
      this.timeout(4000);
      if (sideBar && (await sideBar.isDisplayed())) {
        const viewControl = (await new ActivityBar().getViewControl(
          'Extensions'
        )) as ViewControl;
        sideBar = await viewControl.openView();
        const titlePart = sideBar.getTitlePart();
        const actionButton = await titlePart.getAction(
          'Clear Extensions Search Results'
        );
        if (await actionButton.isEnabled()) {
          await actionButton.click();
        }
      }
    });
  });
}
