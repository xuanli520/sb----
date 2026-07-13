package cn.edu.training.globehello.web;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    private static final DateTimeFormatter RENDER_TIME_FORMAT = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss z");

    @GetMapping({"/", "/hello"})
    public String home(Model model) {
        model.addAttribute("greeting", "HelloWorld");
        model.addAttribute("initialGlobe", AsciiGlobeRenderer.render(0));
        model.addAttribute("renderedAt", RENDER_TIME_FORMAT.format(ZonedDateTime.now()));
        return "index";
    }
}
