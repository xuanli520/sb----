package cn.edu.training.globehello.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.ui.ExtendedModelMap;
import org.springframework.ui.Model;

class HomeControllerTest {

    private final HomeController controller = new HomeController();

    @Test
    void homeRendersTheHelloWorldTemplate() {
        Model model = new ExtendedModelMap();

        String viewName = controller.home(model);

        assertEquals("index", viewName);
        assertEquals("HelloWorld", model.asMap().get("greeting"));
        long lineBreaks = ((String) model.asMap().get("initialGlobe")).chars()
                .filter(character -> character == '\n')
                .count();
        assertEquals(AsciiGlobeRenderer.ROWS - 1, lineBreaks);
    }

    @Test
    void rendererProducesChangingAsciiFrames() {
        String firstFrame = AsciiGlobeRenderer.render(0);
        String nextFrame = AsciiGlobeRenderer.render(1);

        assertNotEquals(firstFrame, nextFrame);
        assertTrue(firstFrame.chars().allMatch(character -> character == '\n' || (character >= 32 && character <= 126)));
    }
}
