<?php

declare(strict_types=1);

namespace OCA\Desktop\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCA\Viewer\Event\LoadViewer;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;

/**
 * Files module of the Desktop app (formerly the standalone "desktopfiles" app).
 * Templates live under templates/files/, assets under js/files/ and css/files/.
 */
class FilesController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private IUserSession $userSession,
        private IURLGenerator $urlGenerator,
        private IEventDispatcher $eventDispatcher,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function index(): TemplateResponse {
        $isDesktopLaunch = $this->request->getParam('desktop') === '1';
        $user = $this->userSession->getUser();

        return new TemplateResponse('desktop_workspace', 'files/main', [
            'isDesktopLaunch' => $isDesktopLaunch,
            'userId' => $user?->getUID() ?? '',
            'desktopUrl' => $this->urlGenerator->linkToRoute('desktop_workspace.page.index'),
        ]);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function viewer(): TemplateResponse {
        $fileId = (string)$this->request->getParam('fileId', '');
        $name = (string)$this->request->getParam('name', 'File');
        $mime = (string)$this->request->getParam('mime', '');
        $path = (string)$this->request->getParam('filePath', '');

        $this->eventDispatcher->dispatchTyped(new LoadViewer());

        return new TemplateResponse('desktop_workspace', 'files/viewer', [
            'fileId' => $fileId,
            'name' => $name,
            'mime' => $mime,
            'path' => $path,
            'userId' => $this->userSession->getUser()?->getUID() ?? '',
        ]);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function details(): TemplateResponse {
        return new TemplateResponse('desktop_workspace', 'files/details', [
            'userId' => $this->userSession->getUser()?->getUID() ?? '',
            'filePath' => (string)$this->request->getParam('filePath', '/'),
            'name' => (string)$this->request->getParam('name', 'Details'),
            'fileId' => (string)$this->request->getParam('fileId', ''),
            'folder' => (string)$this->request->getParam('folder', '0'),
            'size' => (string)$this->request->getParam('size', ''),
            'mime' => (string)$this->request->getParam('mime', ''),
            'modified' => (string)$this->request->getParam('modified', ''),
        ]);
    }
}
