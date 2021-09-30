import { expect } from 'chai';
import {
  ActivityBar,
  SideBarView,
  ViewControl,
  ExtensionsViewSection,
  InputBox,
} from 'vscode-extension-tester';

/**
 * @author Ondrej Dockal <odockal@redhat.com>
 */
export function extensionUIAssetsTest(): void {
  describe('Verify base assets are available after installation', () => {
    let view: ViewControl;
    let sideBar: SideBarView;
    let quickBox: InputBox;

    before(async function () {
      this.timeout(4000);
      view = (await new ActivityBar().getViewControl(
        'Extensions'
      )) as ViewControl;
      sideBar = await view.openView();
    });

    it('VSCode Ansible extension is installed', async function () {
      this.timeout(8000);
      const section = (await sideBar
        .getContent()
        .getSection('Installed')) as ExtensionsViewSection;
      const item = await section.findItem('@installed Ansible');
      expect(item).not.undefined;
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
      if (quickBox && (await quickBox.isDisplayed())) {
        await quickBox.cancel();
      }
    });
  });
}
